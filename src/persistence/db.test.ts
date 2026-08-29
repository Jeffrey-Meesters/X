import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import {
  getDb,
  closeDb,
  writeSessionLog,
  writeSet,
  readAllSessionLogs,
  readAllSets,
  readSetsForExercise,
  writeActiveSession,
  readActiveSession,
  clearActiveSession,
  isResumable,
  exportAll,
  clearAll,
  readProgressionTargets,
  writeProgressionTarget,
  RESUME_WINDOW_MS,
  type ActiveSessionRecord,
} from './db'
import { useHistoryStore } from '@/stores/history'
import { useSessionStore } from '@/stores/session'
import { useSettingsStore } from '@/stores/settings'
import { useSessionRecovery } from '@/composables/useSessionRecovery'
import { buildSegmentList } from '@/engine/segments'
import { SESSION_A } from '@/data/sessions'
import type { LoggedSet, SessionLog } from '@/types/models'

async function freshDb() {
  await closeDb()
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase('fullbody15')
    request.onsuccess = () => resolve()
    request.onerror = () => resolve()
    request.onblocked = () => resolve()
  })
  await getDb()
}

function log(id: string, startedAt: string): SessionLog {
  return {
    id,
    programId: 'fullbody-15',
    sessionId: 'session-a',
    startedAt,
    endedAt: null,
    completed: false,
    sets: [],
  }
}

function set(id: string, logId: string, exerciseId: string, weightKg: number): LoggedSet {
  return {
    id,
    sessionLogId: logId,
    exerciseId,
    round: 1,
    weightKg,
    reps: 10,
    rir: null,
    confirmed: true,
    completedAt: '2026-08-29T09:00:00.000Z',
  }
}

function record(overrides: Partial<ActiveSessionRecord> = {}): ActiveSessionRecord {
  return {
    sessionLogId: 'log-1',
    sessionId: 'session-a',
    startedAt: '2026-08-29T09:00:00.000Z',
    segments: buildSegmentList(SESSION_A),
    segmentIndex: 5,
    elapsedInSegmentMs: 12_000,
    workingTimeMs: 200_000,
    totalElapsedMs: 240_000,
    isPaused: false,
    setsLogged: [],
    savedAt: Date.now(),
    ...overrides,
  }
}

describe('IndexedDB storage', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    localStorage.clear()
    await freshDb()
  })

  it('round-trips session logs and sets', async () => {
    await writeSessionLog(log('log-1', '2026-08-29T09:00:00.000Z'))
    await writeSet(set('set-1', 'log-1', 'goblet-squat', 20))

    expect(await readAllSessionLogs()).toHaveLength(1)
    expect((await readAllSets())[0]?.weightKg).toBe(20)
  })

  it('queries sets by exercise', async () => {
    await writeSet(set('set-1', 'log-1', 'goblet-squat', 20))
    await writeSet(set('set-2', 'log-1', 'db-rdl', 30))

    const squats = await readSetsForExercise('goblet-squat')
    expect(squats).toHaveLength(1)
    expect(squats[0]?.id).toBe('set-1')
  })

  it('orders logs by start time', async () => {
    await writeSessionLog(log('b', '2026-08-30T09:00:00.000Z'))
    await writeSessionLog(log('a', '2026-08-29T09:00:00.000Z'))

    expect((await readAllSessionLogs()).map((l) => l.id)).toEqual(['a', 'b'])
  })

  it('keeps only one active session row', async () => {
    await writeActiveSession(record({ segmentIndex: 1 }))
    await writeActiveSession(record({ segmentIndex: 9 }))

    expect((await readActiveSession())?.segmentIndex).toBe(9)
    expect(await (await getDb()).count('activeSession')).toBe(1)
  })

  it('clears the active session', async () => {
    await writeActiveSession(record())
    await clearActiveSession()
    expect(await readActiveSession()).toBeUndefined()
  })

  it('exports everything and clears everything', async () => {
    await writeSessionLog(log('log-1', '2026-08-29T09:00:00.000Z'))
    await writeSet(set('set-1', 'log-1', 'goblet-squat', 20))

    const exported = await exportAll()
    expect(exported.sessionLogs).toHaveLength(1)
    expect(exported.sets).toHaveLength(1)

    await clearAll()
    expect(await readAllSessionLogs()).toHaveLength(0)
  })
})

describe('the four-hour resume window', () => {
  it('is resumable just inside the window', () => {
    const now = Date.now()
    expect(isResumable(record({ savedAt: now - (RESUME_WINDOW_MS - 1000) }), now)).toBe(true)
  })

  it('is not resumable past it', () => {
    const now = Date.now()
    expect(isResumable(record({ savedAt: now - (RESUME_WINDOW_MS + 1000) }), now)).toBe(false)
  })
})

describe('history store backed by IndexedDB', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    localStorage.clear()
    await freshDb()
  })

  it('persists a session and reads it back into a fresh store', async () => {
    const history = useHistoryStore()
    await history.startSessionLog(log('log-1', '2026-08-29T09:00:00.000Z'))
    await history.addSet(set('set-1', 'log-1', 'goblet-squat', 22.5))

    // A brand new store, as if the app had been restarted.
    setActivePinia(createPinia())
    const reloaded = useHistoryStore()
    await reloaded.load()

    expect(reloaded.sessionLogs).toHaveLength(1)
    expect(reloaded.sets).toHaveLength(1)
    expect(reloaded.lastSessionSetsFor('goblet-squat')[0]?.weightKg).toBe(22.5)
  })

  it('records a set against its session log', async () => {
    const history = useHistoryStore()
    await history.startSessionLog(log('log-1', '2026-08-29T09:00:00.000Z'))
    await history.addSet(set('set-1', 'log-1', 'goblet-squat', 20))

    const stored = await readAllSessionLogs()
    expect(stored[0]?.sets).toEqual(['set-1'])
  })

  it('pre-fills from persisted history across a restart', async () => {
    const history = useHistoryStore()
    await history.startSessionLog(log('log-1', '2026-08-29T09:00:00.000Z'))
    await history.addSet(set('set-1', 'log-1', 'goblet-squat', 30))
    await history.finishSessionLog('log-1', {
      completed: true,
      endedAt: '2026-08-29T09:14:30.000Z',
      workingTimeMs: 870_000,
      totalElapsedMs: 870_000,
    })

    setActivePinia(createPinia())
    useSettingsStore().update({ leadIn: false })
    const reloaded = useHistoryStore()
    await reloaded.load()
    expect(reloaded.completedSessionCount).toBe(1)

    let now = 1_700_000_000_000
    const store = useSessionStore()
    store.start('session-a', { clock: () => now })
    now += 130_000
    store.tick()

    expect(store.draft?.weightKg).toBe(30)
    expect(store.draft?.isCalibration).toBe(false)
  })
})

describe('crash recovery', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    localStorage.clear()
    await freshDb()
  })

  it('restores a session paused, at the position it was interrupted', () => {
    useSettingsStore().update({ leadIn: false })
    const store = useSessionStore()

    store.restoreFrom(record({ segmentIndex: 3, elapsedInSegmentMs: 15_000 }))

    expect(store.isPaused).toBe(true)
    expect(store.snapshot?.index).toBe(3)
    // Segment 3 is the first 40s work interval, 15s in.
    expect(store.snapshot?.remainingMs).toBe(25_000)
  })

  it('does not resume a live countdown', () => {
    useSettingsStore().update({ leadIn: false })
    const store = useSessionStore()
    // Saved while running; it must still come back paused.
    store.restoreFrom(record({ isPaused: false, segmentIndex: 3, elapsedInSegmentMs: 10_000 }))

    expect(store.isPaused).toBe(true)
  })

  it('keeps working and elapsed time across the interruption', () => {
    const store = useSessionStore()
    const now = 1_700_000_000_000
    store.restoreFrom(record({ workingTimeMs: 200_000, totalElapsedMs: 260_000 }), {
      clock: () => now,
    })

    expect(store.snapshot?.workingTimeMs).toBe(200_000)
    expect(store.snapshot?.totalElapsedMs).toBe(260_000)
  })

  it('keeps a rest the user had extended', () => {
    useSettingsStore().update({ leadIn: false })
    // Segment 4 is the first rest; the user had pushed it from 20s to 50s.
    const segments = buildSegmentList(SESSION_A).map((segment, i) =>
      i === 4 ? { ...segment, durationMs: 50_000 } : segment,
    )
    const store = useSessionStore()
    store.restoreFrom(record({ segments, segmentIndex: 4, elapsedInSegmentMs: 0 }))

    // Without persisting durations the user would reopen the app to find the
    // 30 extra seconds they added had silently vanished.
    expect(store.snapshot?.remainingMs).toBe(50_000)
  })

  it('reopens the weight entry when interrupted during a rest', () => {
    useSettingsStore().update({ leadIn: false })
    const store = useSessionStore()
    store.restoreFrom(record({ segmentIndex: 4, elapsedInSegmentMs: 5_000 }))

    expect(store.currentSegment?.type).toBe('transition')
    expect(store.draft).not.toBeNull()
    expect(store.draft?.exerciseId).toBe('goblet-squat')
  })

  it('continues from where it froze once resumed', () => {
    useSettingsStore().update({ leadIn: false })
    const store = useSessionStore()
    store.restoreFrom(record({ segmentIndex: 3, elapsedInSegmentMs: 15_000 }))

    store.togglePause()
    expect(store.isRunning).toBe(true)
    expect(store.snapshot?.remainingMs).toBe(25_000)
  })

  it('offers a resume for a recent interruption', async () => {
    await writeActiveSession(record({ savedAt: Date.now() - 60_000 }))

    const recovery = useSessionRecovery()
    await recovery.check()

    expect(recovery.pending.value).toBeDefined()
    expect(recovery.pending.value?.sessionId).toBe('session-a')
  })

  it('finalises a stale one as partial instead of offering it', async () => {
    const history = useHistoryStore()
    await history.startSessionLog(log('log-1', '2026-08-29T09:00:00.000Z'))
    await writeActiveSession(
      record({ sessionLogId: 'log-1', savedAt: Date.now() - (RESUME_WINDOW_MS + 60_000) }),
    )

    const recovery = useSessionRecovery()
    await recovery.check()

    expect(recovery.pending.value).toBeUndefined()
    // The sets that were logged are kept; only the resume is withheld.
    const stored = await readAllSessionLogs()
    expect(stored[0]?.completed).toBe(false)
    expect(stored[0]?.endedAt).not.toBeNull()
    expect(await readActiveSession()).toBeUndefined()
  })

  it('discarding keeps the logged sets as a partial session', async () => {
    const history = useHistoryStore()
    await history.startSessionLog(log('log-1', '2026-08-29T09:00:00.000Z'))
    await history.addSet(set('set-1', 'log-1', 'goblet-squat', 20))
    await writeActiveSession(record({ sessionLogId: 'log-1', savedAt: Date.now() - 60_000 }))

    const recovery = useSessionRecovery()
    await recovery.check()
    await recovery.discard()

    expect(recovery.pending.value).toBeUndefined()
    expect((await readAllSets())).toHaveLength(1)
    expect(await readActiveSession()).toBeUndefined()
  })

  it('does nothing when there is no interrupted session', async () => {
    const recovery = useSessionRecovery()
    await recovery.check()

    expect(recovery.pending.value).toBeUndefined()
    expect(recovery.checked.value).toBe(true)
  })
})

describe('progression targets', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    localStorage.clear()
    await freshDb()
  })

  it('round-trips an accepted target', async () => {
    const history = useHistoryStore()
    await history.acceptProgression('goblet-squat', 22.5)

    setActivePinia(createPinia())
    const reloaded = useHistoryStore()
    await reloaded.load()

    expect(reloaded.targetFor('goblet-squat')).toBe(22.5)
  })

  it('keeps only the latest target per exercise', async () => {
    const history = useHistoryStore()
    await history.acceptProgression('goblet-squat', 22.5)
    await history.acceptProgression('goblet-squat', 25)

    expect(history.targets.filter((t) => t.exerciseId === 'goblet-squat')).toHaveLength(1)
    expect(history.targetFor('goblet-squat')).toBe(25)
  })

  it('stops applying once the exercise has been lifted since', async () => {
    const history = useHistoryStore()
    await history.acceptProgression('goblet-squat', 22.5)

    // A target accepted and then never acted on should not keep overriding a
    // pre-fill the user has since moved past by hand.
    await history.startSessionLog(log('log-2', '2026-08-30T09:00:00.000Z'))
    await history.addSet({
      ...set('set-9', 'log-2', 'goblet-squat', 30),
      completedAt: new Date(Date.now() + 60_000).toISOString(),
    })

    expect(history.targetFor('goblet-squat')).toBeUndefined()
  })

  it('does not leak between exercises', async () => {
    const history = useHistoryStore()
    await history.acceptProgression('goblet-squat', 22.5)
    expect(history.targetFor('db-rdl')).toBeUndefined()
  })

  it('can be cleared', async () => {
    const history = useHistoryStore()
    await history.acceptProgression('goblet-squat', 22.5)
    await history.clearTarget('goblet-squat')

    expect(history.targetFor('goblet-squat')).toBeUndefined()
    expect(await readProgressionTargets()).toEqual([])
  })

  it('is included in the export', async () => {
    const history = useHistoryStore()
    await history.acceptProgression('goblet-squat', 22.5)

    const exported = await exportAll()
    expect(exported.progressionTargets).toHaveLength(1)
  })
})

describe('schema migration from v1', () => {
  it('adds the new store to an existing v1 database without losing history', async () => {
    await closeDb()
    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase('fullbody15')
      request.onsuccess = () => resolve()
      request.onerror = () => resolve()
      request.onblocked = () => resolve()
    })

    // Build a v1 database by hand, exactly as the shipped v1 upgrade did.
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('fullbody15', 1)
      open.onupgradeneeded = () => {
        const db = open.result
        const logs = db.createObjectStore('sessionLogs', { keyPath: 'id' })
        logs.createIndex('by-startedAt', 'startedAt')
        const sets = db.createObjectStore('sets', { keyPath: 'id' })
        sets.createIndex('by-sessionLogId', 'sessionLogId')
        sets.createIndex('by-exerciseId', 'exerciseId')
        db.createObjectStore('activeSession')
      }
      open.onsuccess = () => {
        const db = open.result
        const tx = db.transaction('sessionLogs', 'readwrite')
        tx.objectStore('sessionLogs').put(log('legacy', '2026-08-01T09:00:00.000Z'))
        tx.oncomplete = () => {
          db.close()
          resolve()
        }
        tx.onerror = () => reject(tx.error)
      }
      open.onerror = () => reject(open.error)
    })

    // Opening at the current version must migrate rather than start over: a
    // device with months of history has to gain the new store and keep it all.
    const stored = await readAllSessionLogs()
    expect(stored.map((l) => l.id)).toEqual(['legacy'])
    expect(await readProgressionTargets()).toEqual([])

    await writeProgressionTarget({
      exerciseId: 'goblet-squat',
      weightKg: 20,
      acceptedAt: '2026-08-29T09:00:00.000Z',
    })
    expect(await readProgressionTargets()).toHaveLength(1)
    expect((await readAllSessionLogs()).map((l) => l.id)).toEqual(['legacy'])
  })
})
