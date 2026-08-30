import type { LoggedSet, SessionLog, Settings } from '@/types/models'
import type { ProgressionTarget } from '@/persistence/db'
import { DEFAULT_SETTINGS } from '@/stores/settings'

/**
 * JSON export and import - the only way data moves between devices (spec
 * section 8), and so the only way a user can lose history.
 *
 * Two rules follow from that, and both are load-bearing:
 *
 * 1. **Validate everything before writing anything.** A half-applied import is
 *    worse than a rejected one, because the user cannot tell what survived.
 *    `parseImport` does the whole job and hands back either a complete,
 *    typed payload or a message; nothing here touches storage.
 * 2. **The file carries its format version.** Without it, a future change to
 *    the shape gets silently mis-parsed into plausible-looking wrong data
 *    rather than refused.
 */

/** Distinguishes our file from any other JSON someone might pick. */
export const EXPORT_FORMAT = 'fullbody15.export'

/** Bump when the shape changes incompatibly. */
export const EXPORT_VERSION = 1

export interface ExportFile {
  readonly format: typeof EXPORT_FORMAT
  readonly version: number
  readonly exportedAt: string
  readonly settings: Settings
  readonly sessionLogs: readonly SessionLog[]
  readonly sets: readonly LoggedSet[]
  readonly progressionTargets: readonly ProgressionTarget[]
}

export interface ImportCounts {
  readonly sessions: number
  readonly sets: number
}

export type ParseResult =
  | { readonly ok: true; readonly file: ExportFile; readonly counts: ImportCounts }
  | { readonly ok: false; readonly error: string }

export function buildExportFile(input: {
  settings: Settings
  sessionLogs: readonly SessionLog[]
  sets: readonly LoggedSet[]
  progressionTargets: readonly ProgressionTarget[]
  exportedAt?: Date
}): ExportFile {
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: (input.exportedAt ?? new Date()).toISOString(),
    settings: input.settings,
    sessionLogs: input.sessionLogs,
    sets: input.sets,
    progressionTargets: input.progressionTargets,
  }
}

/** `fullbody15-2026-08-29.json` - sorts chronologically in a downloads folder. */
export function exportFilename(at: Date = new Date()): string {
  return `fullbody15-${at.toISOString().slice(0, 10)}.json`
}

// --- validation ------------------------------------------------------------
//
// Hand-written rather than pulled from a schema library: it is one file shape,
// the messages need to be readable by the person holding the phone, and a
// validator dependency would be larger than the app's entire runtime.

class Invalid extends Error {}

function fail(message: string): never {
  throw new Invalid(message)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function str(source: Record<string, unknown>, key: string, where: string): string {
  const value = source[key]
  if (typeof value !== 'string' || value === '') fail(`${where} is missing "${key}".`)
  return value
}

function nullableStr(source: Record<string, unknown>, key: string, where: string): string | null {
  const value = source[key]
  if (value === null || value === undefined) return null
  if (typeof value !== 'string') fail(`${where} has a "${key}" that is not text.`)
  return value
}

function num(source: Record<string, unknown>, key: string, where: string): number {
  const value = source[key]
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(`${where} has a "${key}" that is not a number.`)
  }
  return value
}

function optionalNum(
  source: Record<string, unknown>,
  key: string,
  where: string,
): number | undefined {
  if (source[key] === undefined) return undefined
  return num(source, key, where)
}

function bool(source: Record<string, unknown>, key: string, where: string): boolean {
  const value = source[key]
  if (typeof value !== 'boolean') fail(`${where} has a "${key}" that is not true or false.`)
  return value
}

function strArray(source: Record<string, unknown>, key: string, where: string): string[] {
  const value = source[key]
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    fail(`${where} has a "${key}" that is not a list of ids.`)
  }
  return value as string[]
}

function list(value: unknown, key: string): Record<string, unknown>[] {
  if (!Array.isArray(value)) fail(`"${key}" is missing or is not a list.`)
  return value.map((entry, index) => {
    if (!isRecord(entry)) fail(`${key}[${index}] is not an object.`)
    return entry
  })
}

function readSessionLog(raw: Record<string, unknown>, index: number): SessionLog {
  const where = `Session ${index + 1}`
  const workingTimeMs = optionalNum(raw, 'workingTimeMs', where)
  const totalElapsedMs = optionalNum(raw, 'totalElapsedMs', where)
  const rounds = optionalNum(raw, 'rounds', where)
  return {
    id: str(raw, 'id', where),
    programId: str(raw, 'programId', where),
    sessionId: str(raw, 'sessionId', where),
    startedAt: str(raw, 'startedAt', where),
    endedAt: nullableStr(raw, 'endedAt', where),
    completed: bool(raw, 'completed', where),
    sets: strArray(raw, 'sets', where),
    // Spread rather than assigned, because `exactOptionalPropertyTypes` treats
    // an explicit `undefined` as different from an absent key.
    ...(workingTimeMs === undefined ? {} : { workingTimeMs }),
    ...(totalElapsedMs === undefined ? {} : { totalElapsedMs }),
    ...(rounds === undefined ? {} : { rounds }),
  }
}

function readSet(raw: Record<string, unknown>, index: number): LoggedSet {
  const where = `Set ${index + 1}`
  const rir = raw['rir']
  if (rir !== null && rir !== undefined && typeof rir !== 'number') {
    fail(`${where} has a "rir" that is neither a number nor empty.`)
  }
  const weightKg = num(raw, 'weightKg', where)
  if (weightKg < 0) fail(`${where} has a negative weight.`)
  const reps = num(raw, 'reps', where)
  if (reps < 0) fail(`${where} has a negative rep count.`)

  return {
    id: str(raw, 'id', where),
    sessionLogId: str(raw, 'sessionLogId', where),
    exerciseId: str(raw, 'exerciseId', where),
    round: num(raw, 'round', where),
    weightKg,
    reps,
    rir: typeof rir === 'number' ? rir : null,
    // Files written before `confirmed` existed default to false, which is the
    // conservative read: an unknown set is not evidence for a weight increase.
    confirmed: typeof raw['confirmed'] === 'boolean' ? raw['confirmed'] : false,
    completedAt: str(raw, 'completedAt', where),
  }
}

function readTarget(raw: Record<string, unknown>, index: number): ProgressionTarget {
  const where = `Progression target ${index + 1}`
  return {
    exerciseId: str(raw, 'exerciseId', where),
    weightKg: num(raw, 'weightKg', where),
    acceptedAt: str(raw, 'acceptedAt', where),
  }
}

/**
 * Known keys only, and only where the type matches the default.
 *
 * Deliberately forgiving in both directions: a file from an older build is
 * missing keys, a file from a newer one carries keys this build has never
 * heard of, and neither is a reason to refuse someone their training history.
 */
function readSettings(value: unknown): Settings {
  const merged: Settings = { ...DEFAULT_SETTINGS }
  if (!isRecord(value)) return merged

  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    const incoming = value[key]
    if (incoming === undefined) continue
    if (matchesDefaultShape(incoming, DEFAULT_SETTINGS[key])) {
      Object.assign(merged, { [key]: incoming })
    }
  }
  return merged
}

function matchesDefaultShape(incoming: unknown, expected: unknown): boolean {
  // `onboardingCompletedAt` and `safetyAcknowledgedAt` default to null, so
  // their type is checked against what they may hold rather than the default.
  if (expected === null) return incoming === null || typeof incoming === 'string'
  // `typeof` alone would wave through an array or a null for `exerciseSwaps`,
  // and a swap map whose values are not ids would send the segment builder
  // looking up an exercise that cannot exist.
  if (typeof expected === 'object') {
    return isRecord(incoming) && Object.values(incoming).every((v) => typeof v === 'string')
  }
  return typeof incoming === typeof expected
}

export function parseImport(text: string): ParseResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, error: 'That file is not valid JSON.' }
  }

  try {
    if (!isRecord(raw)) fail('That file does not contain an export.')
    if (raw['format'] !== EXPORT_FORMAT) {
      fail('That file was not exported by this app.')
    }

    const version = raw['version']
    if (typeof version !== 'number') fail('That export is missing its format version.')
    if (version > EXPORT_VERSION) {
      fail(
        `That export was written by a newer version of the app (format ${version}). Update the app, then import it.`,
      )
    }

    const sessionLogs = list(raw['sessionLogs'], 'sessionLogs').map(readSessionLog)
    const sets = list(raw['sets'], 'sets').map(readSet)
    const progressionTargets = list(raw['progressionTargets'], 'progressionTargets').map(readTarget)

    const file: ExportFile = {
      format: EXPORT_FORMAT,
      version,
      exportedAt: typeof raw['exportedAt'] === 'string' ? raw['exportedAt'] : '',
      settings: readSettings(raw['settings']),
      sessionLogs,
      sets,
      progressionTargets,
    }

    return { ok: true, file, counts: { sessions: sessionLogs.length, sets: sets.length } }
  } catch (error) {
    if (error instanceof Invalid) return { ok: false, error: error.message }
    throw error
  }
}
