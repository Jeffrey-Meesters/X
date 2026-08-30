import { describe, it, expect } from 'vitest'
import {
  EXPORT_FORMAT,
  EXPORT_VERSION,
  buildExportFile,
  exportFilename,
  parseImport,
} from './exportImport'
import { DEFAULT_SETTINGS } from '@/stores/settings'
import type { LoggedSet, SessionLog } from '@/types/models'
import type { ProgressionTarget } from './db'

const LOG: SessionLog = {
  id: 'log-1',
  programId: 'fullbody-4x',
  sessionId: 'session-a',
  startedAt: '2026-08-20T09:00:00.000Z',
  endedAt: '2026-08-20T09:15:00.000Z',
  completed: true,
  sets: ['set-1'],
  workingTimeMs: 870_000,
  totalElapsedMs: 900_000,
}

const SET: LoggedSet = {
  id: 'set-1',
  sessionLogId: 'log-1',
  exerciseId: 'goblet-squat',
  round: 1,
  weightKg: 20,
  reps: 12,
  rir: 2,
  confirmed: true,
  completedAt: '2026-08-20T09:03:00.000Z',
}

const TARGET: ProgressionTarget = {
  exerciseId: 'goblet-squat',
  weightKg: 22.5,
  acceptedAt: '2026-08-20T09:16:00.000Z',
}

function fileWith(patch: Record<string, unknown>): string {
  return JSON.stringify({
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: '2026-08-29T09:00:00.000Z',
    settings: DEFAULT_SETTINGS,
    sessionLogs: [LOG],
    sets: [SET],
    progressionTargets: [TARGET],
    ...patch,
  })
}

describe('export', () => {
  it('stamps the format marker and version', () => {
    const file = buildExportFile({
      settings: DEFAULT_SETTINGS,
      sessionLogs: [LOG],
      sets: [SET],
      progressionTargets: [TARGET],
      exportedAt: new Date('2026-08-29T09:00:00.000Z'),
    })

    expect(file.format).toBe(EXPORT_FORMAT)
    expect(file.version).toBe(EXPORT_VERSION)
    expect(file.exportedAt).toBe('2026-08-29T09:00:00.000Z')
  })

  it('names the file by date so downloads sort chronologically', () => {
    expect(exportFilename(new Date('2026-08-29T22:30:00.000Z'))).toBe('fullbody15-2026-08-29.json')
  })
})

describe('round trip', () => {
  it('survives export -> JSON -> import unchanged', () => {
    const file = buildExportFile({
      settings: { ...DEFAULT_SETTINGS, units: 'lb', weightIncrement: 5 },
      sessionLogs: [LOG],
      sets: [SET],
      progressionTargets: [TARGET],
    })

    const result = parseImport(JSON.stringify(file))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.file.sessionLogs).toEqual([LOG])
    expect(result.file.sets).toEqual([SET])
    expect(result.file.progressionTargets).toEqual([TARGET])
    expect(result.file.settings.units).toBe('lb')
    expect(result.counts).toEqual({ sessions: 1, sets: 1 })
  })

  it('keeps an absent optional field absent rather than present-and-undefined', () => {
    const { workingTimeMs: _w, totalElapsedMs: _t, ...withoutTimings } = LOG
    const result = parseImport(fileWith({ sessionLogs: [withoutTimings] }))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect('workingTimeMs' in result.file.sessionLogs[0]!).toBe(false)
  })
})

describe('rejection', () => {
  it('refuses text that is not JSON', () => {
    const result = parseImport('this is my workout data, honest')
    expect(result).toEqual({ ok: false, error: 'That file is not valid JSON.' })
  })

  it('refuses JSON from some other app', () => {
    const result = parseImport(JSON.stringify({ version: 1, sessionLogs: [] }))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('not exported by this app')
  })

  it('refuses a format version it cannot read, naming the version', () => {
    const result = parseImport(fileWith({ version: EXPORT_VERSION + 1 }))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain(`format ${EXPORT_VERSION + 1}`)
  })

  it('accepts an older format version', () => {
    // Nothing has been retired yet, but the check must be one-directional:
    // a v1 reader refusing v1 files after the version bumps would be a
    // spectacular own goal.
    expect(parseImport(fileWith({ version: EXPORT_VERSION })).ok).toBe(true)
  })

  it('names the record that is wrong', () => {
    const { id: _id, ...idless } = LOG
    const result = parseImport(fileWith({ sessionLogs: [LOG, idless] }))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe('Session 2 is missing "id".')
  })

  it('refuses a set whose weight is not a number', () => {
    const result = parseImport(fileWith({ sets: [{ ...SET, weightKg: '20kg' }] }))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('"weightKg" that is not a number')
  })

  it('refuses negative loads', () => {
    const result = parseImport(fileWith({ sets: [{ ...SET, weightKg: -5 }] }))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('negative weight')
  })

  it('refuses a top-level list that is not a list', () => {
    const result = parseImport(fileWith({ sets: { 'set-1': SET } }))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe('"sets" is missing or is not a list.')
  })
})

describe('tolerance', () => {
  it('reads a set written before `confirmed` existed as unconfirmed', () => {
    // The conservative direction: an unknown set is not evidence the user
    // cleared the rep range, so it must not license a weight increase.
    const { confirmed: _c, ...legacy } = SET
    const result = parseImport(fileWith({ sets: [legacy] }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.file.sets[0]!.confirmed).toBe(false)
  })

  it('accepts an empty rir', () => {
    const result = parseImport(fileWith({ sets: [{ ...SET, rir: null }] }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.file.sets[0]!.rir).toBeNull()
  })

  it('fills in settings the file predates, and ignores ones it invented', () => {
    const result = parseImport(
      fileWith({ settings: { units: 'lb', favouriteColour: 'green' } }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.file.settings.units).toBe('lb')
    expect(result.file.settings.haptics).toBe(DEFAULT_SETTINGS.haptics)
    expect('favouriteColour' in result.file.settings).toBe(false)
  })

  it('ignores a setting whose type is wrong rather than failing the import', () => {
    const result = parseImport(fileWith({ settings: { units: 'lb', haptics: 'yes please' } }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.file.settings.haptics).toBe(DEFAULT_SETTINGS.haptics)
  })

  it('carries the acknowledgement stamps through, so an import does not re-onboard', () => {
    const result = parseImport(
      fileWith({
        settings: { ...DEFAULT_SETTINGS, safetyAcknowledgedAt: '2026-01-01T00:00:00.000Z' },
      }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.file.settings.safetyAcknowledgedAt).toBe('2026-01-01T00:00:00.000Z')
  })
})
