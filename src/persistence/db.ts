import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { LoggedSet, SessionLog } from '@/types/models'
import type { Segment } from '@/engine/segments'

/**
 * IndexedDB for session logs, sets and the crash-recovery row.
 *
 * Settings deliberately stay in localStorage: they are one small object the
 * player needs synchronously on boot, and making it wait on an async open to
 * learn whether audio is on would be worse for no benefit.
 */

const DB_NAME = 'fullbody15'
const DB_VERSION = 2

/** Only ever one row, under this key. */
export const ACTIVE_SESSION_KEY = 'current'

/** How long an interrupted session stays resumable (spec section 3.0.1). */
export const RESUME_WINDOW_MS = 4 * 60 * 60 * 1000

export interface ActiveSessionRecord {
  readonly sessionLogId: string
  readonly sessionId: string
  readonly startedAt: string
  /**
   * The segment list as built for this session, carrying any durations the
   * user extended. Stored rather than rebuilt, because rebuilding depends on
   * settings that may have changed since - a different lead-in or bench answer
   * would shift every index and restore the wrong segment.
   */
  readonly segments: readonly Segment[]
  readonly segmentIndex: number
  readonly elapsedInSegmentMs: number
  readonly workingTimeMs: number
  readonly totalElapsedMs: number
  readonly isPaused: boolean
  readonly setsLogged: readonly string[]
  readonly savedAt: number
}

/**
 * A weight the user accepted from a progression nudge.
 *
 * Kept separate from logged sets because it is a statement of intent for the
 * *next* session, not a record of something that happened. Folding it into
 * history would mean inventing a set nobody performed.
 */
export interface ProgressionTarget {
  readonly exerciseId: string
  readonly weightKg: number
  readonly acceptedAt: string
}

interface TrainerDB extends DBSchema {
  sessionLogs: {
    key: string
    value: SessionLog
    indexes: { 'by-startedAt': string }
  }
  sets: {
    key: string
    value: LoggedSet
    indexes: { 'by-sessionLogId': string; 'by-exerciseId': string }
  }
  activeSession: {
    key: string
    value: ActiveSessionRecord
  }
  progressionTargets: {
    key: string
    value: ProgressionTarget
  }
}

let dbPromise: Promise<IDBPDatabase<TrainerDB>> | undefined

export function getDb(): Promise<IDBPDatabase<TrainerDB>> {
  dbPromise ??= openDB<TrainerDB>(DB_NAME, DB_VERSION, {
    /**
     * Runs for a fresh database and for every upgrade, with `oldVersion` 0 on
     * first install. Each step is guarded on its own version rather than
     * assuming a fresh install, because a device that already has v1 must gain
     * the new store without losing its history.
     */
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        const logs = db.createObjectStore('sessionLogs', { keyPath: 'id' })
        logs.createIndex('by-startedAt', 'startedAt')

        const sets = db.createObjectStore('sets', { keyPath: 'id' })
        sets.createIndex('by-sessionLogId', 'sessionLogId')
        sets.createIndex('by-exerciseId', 'exerciseId')

        db.createObjectStore('activeSession')
      }

      if (oldVersion < 2) {
        db.createObjectStore('progressionTargets', { keyPath: 'exerciseId' })
      }
    },
  })
  return dbPromise
}

/**
 * Closes the cached connection and forgets it.
 *
 * Closing matters: an open connection blocks `deleteDatabase`, and a blocked
 * delete never fires success, so a test that only dropped the reference would
 * hang rather than fail.
 */
export async function closeDb(): Promise<void> {
  if (!dbPromise) return
  const db = await dbPromise.catch(() => undefined)
  db?.close()
  dbPromise = undefined
}

/**
 * Strips Vue reactivity before a write.
 *
 * Records reaching this layer often come from reactive store state, and
 * IndexedDB's structured clone throws DataCloneError on a Proxy. These are pure
 * JSON records - strings, numbers, booleans, arrays - so a round trip is both
 * safe and the cheapest way to guarantee a plain object at the boundary.
 */
function toStorable<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export async function readAllSessionLogs(): Promise<SessionLog[]> {
  return (await getDb()).getAllFromIndex('sessionLogs', 'by-startedAt')
}

export async function readAllSets(): Promise<LoggedSet[]> {
  return (await getDb()).getAll('sets')
}

export async function writeSessionLog(log: SessionLog): Promise<void> {
  await (await getDb()).put('sessionLogs', toStorable(log))
}

export async function writeSet(set: LoggedSet): Promise<void> {
  await (await getDb()).put('sets', toStorable(set))
}

export async function readSetsForExercise(exerciseId: string): Promise<LoggedSet[]> {
  return (await getDb()).getAllFromIndex('sets', 'by-exerciseId', exerciseId)
}

export async function readActiveSession(): Promise<ActiveSessionRecord | undefined> {
  return (await getDb()).get('activeSession', ACTIVE_SESSION_KEY)
}

export async function writeActiveSession(record: ActiveSessionRecord): Promise<void> {
  await (await getDb()).put('activeSession', toStorable(record), ACTIVE_SESSION_KEY)
}

export async function clearActiveSession(): Promise<void> {
  await (await getDb()).delete('activeSession', ACTIVE_SESSION_KEY)
}

/** True while an interrupted session is still recent enough to offer a resume. */
export function isResumable(record: ActiveSessionRecord, now: number): boolean {
  return now - record.savedAt < RESUME_WINDOW_MS
}

export async function readProgressionTargets(): Promise<ProgressionTarget[]> {
  return (await getDb()).getAll('progressionTargets')
}

export async function writeProgressionTarget(target: ProgressionTarget): Promise<void> {
  await (await getDb()).put('progressionTargets', toStorable(target))
}

export async function clearProgressionTarget(exerciseId: string): Promise<void> {
  await (await getDb()).delete('progressionTargets', exerciseId)
}

/** Everything, for the JSON export. */
export async function exportAll(): Promise<{
  sessionLogs: SessionLog[]
  sets: LoggedSet[]
  progressionTargets: ProgressionTarget[]
}> {
  const [sessionLogs, sets, progressionTargets] = await Promise.all([
    readAllSessionLogs(),
    readAllSets(),
    readProgressionTargets(),
  ])
  return { sessionLogs, sets, progressionTargets }
}

export async function clearAll(): Promise<void> {
  const db = await getDb()
  await Promise.all([
    db.clear('sessionLogs'),
    db.clear('sets'),
    db.clear('activeSession'),
    db.clear('progressionTargets'),
  ])
}

/**
 * Wipes local data and installs the contents of an import, in one transaction.
 *
 * One transaction rather than a clear followed by writes, because the failure
 * mode of the naive version is losing everything: a quota error or a browser
 * closing the tab halfway through leaves the user with neither their old
 * history nor the imported file's. IndexedDB aborts and rolls the whole thing
 * back instead.
 *
 * The recovery row goes too. It points at a session log that is about to stop
 * existing, and offering to resume it would restore a workout with nowhere to
 * write its sets.
 */
export async function replaceAll(data: {
  sessionLogs: readonly SessionLog[]
  sets: readonly LoggedSet[]
  progressionTargets: readonly ProgressionTarget[]
}): Promise<void> {
  const db = await getDb()
  const tx = db.transaction(
    ['sessionLogs', 'sets', 'activeSession', 'progressionTargets'],
    'readwrite',
  )

  const logs = tx.objectStore('sessionLogs')
  const sets = tx.objectStore('sets')
  const targets = tx.objectStore('progressionTargets')

  // Every request is issued before anything is awaited. IndexedDB runs a
  // transaction's requests in the order they were placed, so the clears still
  // happen before the puts - while awaiting in between would hand control back
  // and risk the transaction auto-committing underneath the writes.
  await Promise.all([
    logs.clear(),
    sets.clear(),
    targets.clear(),
    tx.objectStore('activeSession').clear(),
    ...data.sessionLogs.map((log) => logs.put(toStorable(log))),
    ...data.sets.map((set) => sets.put(toStorable(set))),
    ...data.progressionTargets.map((target) => targets.put(toStorable(target))),
  ])

  await tx.done
}
