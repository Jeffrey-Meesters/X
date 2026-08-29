import { describe, it, expect } from 'vitest'
import {
  summariseSession,
  exerciseHistory,
  bestSet,
  weekStartOf,
  weeklySummaries,
} from './summary'
import type { LoggedSet, SessionLog } from '@/types/models'

function set(
  overrides: Partial<LoggedSet> & { weightKg: number; reps: number },
): LoggedSet {
  return {
    id: crypto.randomUUID(),
    sessionLogId: 'log-1',
    exerciseId: 'goblet-squat',
    round: 1,
    rir: null,
    confirmed: true,
    completedAt: '2026-08-29T09:00:00.000Z',
    ...overrides,
  }
}

function log(id: string, startedAt: string, completed = true): SessionLog {
  return {
    id,
    programId: 'fullbody-15',
    sessionId: 'session-a',
    startedAt,
    endedAt: startedAt,
    completed,
    sets: [],
  }
}

const target = () => [8, 12] as const
const rounds = () => 3

describe('session summary', () => {
  it('groups sets by exercise in the order they were performed', () => {
    const summary = summariseSession(
      [
        set({ weightKg: 20, reps: 12 }),
        set({ weightKg: 30, reps: 10, exerciseId: 'db-rdl' }),
        set({ weightKg: 22.5, reps: 11 }),
      ],
      target,
      rounds,
    )

    expect(summary.exercises.map((e) => e.exerciseId)).toEqual(['goblet-squat', 'db-rdl'])
    expect(summary.setsCompleted).toBe(3)
  })

  it('totals volume as weight times reps', () => {
    const summary = summariseSession(
      [set({ weightKg: 20, reps: 10 }), set({ weightKg: 30, reps: 5 })],
      target,
      rounds,
    )
    expect(summary.totalVolumeKg).toBe(350)
  })

  it('reports the top weight per exercise', () => {
    const summary = summariseSession(
      [set({ weightKg: 20, reps: 12 }), set({ weightKg: 25, reps: 8 })],
      target,
      rounds,
    )
    expect(summary.exercises[0]?.topWeightKg).toBe(25)
  })

  it('clears the range when every round hits the top and is confirmed', () => {
    const sets = [1, 2, 3].map((round) => set({ weightKg: 20, reps: 12, round }))
    const summary = summariseSession(sets, target, rounds)

    expect(summary.cleared.map((e) => e.exerciseId)).toEqual(['goblet-squat'])
  })

  it('does not clear the range on unconfirmed sets', () => {
    // The same reps, but nobody entered them: reps default to the top, so this
    // would otherwise read as a clean sweep every single session.
    const sets = [1, 2, 3].map((round) =>
      set({ weightKg: 20, reps: 12, round, confirmed: false }),
    )
    expect(summariseSession(sets, target, rounds).cleared).toEqual([])
  })

  it('does not clear the range on a short session', () => {
    const sets = [1, 2].map((round) => set({ weightKg: 20, reps: 12, round }))
    expect(summariseSession(sets, target, rounds).cleared).toEqual([])
  })

  it('does not clear the range when one round fell short', () => {
    const sets = [
      set({ weightKg: 20, reps: 12, round: 1 }),
      set({ weightKg: 20, reps: 10, round: 2 }),
      set({ weightKg: 20, reps: 12, round: 3 }),
    ]
    expect(summariseSession(sets, target, rounds).cleared).toEqual([])
  })

  it('handles an exercise with no target range', () => {
    const summary = summariseSession([set({ weightKg: 20, reps: 12 })], () => undefined, rounds)
    expect(summary.cleared).toEqual([])
    expect(summary.exercises).toHaveLength(1)
  })

  it('is empty for a session with no sets', () => {
    const summary = summariseSession([], target, rounds)
    expect(summary.setsCompleted).toBe(0)
    expect(summary.totalVolumeKg).toBe(0)
    expect(summary.exercises).toEqual([])
  })
})

describe('per-exercise history', () => {
  const logs = [
    log('a', '2026-08-01T09:00:00.000Z'),
    log('b', '2026-08-08T09:00:00.000Z'),
  ]

  it('gives one point per session, oldest first', () => {
    const points = exerciseHistory(
      [
        set({ weightKg: 25, reps: 10, sessionLogId: 'b' }),
        set({ weightKg: 20, reps: 12, sessionLogId: 'a' }),
      ],
      logs,
      'goblet-squat',
    )

    expect(points.map((p) => p.topWeightKg)).toEqual([20, 25])
  })

  it('reduces a session to its heaviest set', () => {
    const points = exerciseHistory(
      [
        set({ weightKg: 20, reps: 12, sessionLogId: 'a' }),
        set({ weightKg: 25, reps: 8, sessionLogId: 'a' }),
      ],
      logs,
      'goblet-squat',
    )

    expect(points).toHaveLength(1)
    expect(points[0]?.topWeightKg).toBe(25)
    expect(points[0]?.repsAtTopWeight).toBe(8)
  })

  it('takes the best reps when the top weight was lifted more than once', () => {
    const points = exerciseHistory(
      [
        set({ weightKg: 25, reps: 8, sessionLogId: 'a' }),
        set({ weightKg: 25, reps: 11, sessionLogId: 'a' }),
      ],
      logs,
      'goblet-squat',
    )
    expect(points[0]?.repsAtTopWeight).toBe(11)
  })

  it('ignores other exercises', () => {
    const points = exerciseHistory(
      [
        set({ weightKg: 20, reps: 12, sessionLogId: 'a' }),
        set({ weightKg: 60, reps: 12, sessionLogId: 'a', exerciseId: 'db-rdl' }),
      ],
      logs,
      'goblet-squat',
    )
    expect(points).toHaveLength(1)
    expect(points[0]?.topWeightKg).toBe(20)
  })

  it('is empty for an exercise never logged', () => {
    expect(exerciseHistory([], logs, 'goblet-squat')).toEqual([])
  })
})

describe('best set', () => {
  it('picks the highest estimated one-rep max, not the heaviest weight', () => {
    // 20kg x 12 estimates higher than 25kg x 1.
    const best = bestSet(
      [set({ weightKg: 25, reps: 1 }), set({ weightKg: 20, reps: 12 })],
      'goblet-squat',
    )
    expect(best?.weightKg).toBe(20)
  })

  it('is undefined when nothing was logged', () => {
    expect(bestSet([], 'goblet-squat')).toBeUndefined()
  })
})

describe('week boundaries', () => {
  it('starts weeks on Monday', () => {
    // 2026-08-29 is a Saturday.
    expect(weekStartOf(new Date('2026-08-29T12:00:00Z'))).toBe('2026-08-24')
  })

  it('keeps Monday itself as the start', () => {
    expect(weekStartOf(new Date('2026-08-24T00:00:00Z'))).toBe('2026-08-24')
  })

  it('puts Sunday at the end of its week, not the start', () => {
    // The trap in a naive getDay(): Sunday is 0 and would not move at all.
    expect(weekStartOf(new Date('2026-08-30T23:00:00Z'))).toBe('2026-08-24')
  })
})

describe('weekly summaries', () => {
  const muscles = (id: string) => (id === 'goblet-squat' ? ['quads', 'glutes'] : ['back'])

  it('rolls sessions up by week, newest first', () => {
    const logs = [log('a', '2026-08-24T09:00:00.000Z'), log('b', '2026-08-17T09:00:00.000Z')]
    const weeks = weeklySummaries(logs, [], muscles)

    expect(weeks.map((w) => w.weekStart)).toEqual(['2026-08-24', '2026-08-17'])
  })

  it('counts only completed sessions toward the weekly target', () => {
    const logs = [
      log('a', '2026-08-24T09:00:00.000Z'),
      log('b', '2026-08-25T09:00:00.000Z', false),
    ]
    const weeks = weeklySummaries(logs, [], muscles)

    expect(weeks[0]?.sessionsCompleted).toBe(1)
  })

  it('counts sets against every primary muscle of the exercise', () => {
    const logs = [log('a', '2026-08-24T09:00:00.000Z')]
    const sets = [
      set({ weightKg: 20, reps: 10, sessionLogId: 'a' }),
      set({ weightKg: 20, reps: 10, sessionLogId: 'a' }),
      set({ weightKg: 20, reps: 10, sessionLogId: 'a', exerciseId: 'single-arm-row' }),
    ]

    expect(weeklySummaries(logs, sets, muscles)[0]?.setsPerMuscleGroup).toEqual({
      quads: 2,
      glutes: 2,
      back: 1,
    })
  })

  it('totals volume across the week, partial sessions included', () => {
    // A session that was cut short is still training that happened.
    const logs = [
      log('a', '2026-08-24T09:00:00.000Z'),
      log('b', '2026-08-26T09:00:00.000Z', false),
    ]
    const sets = [
      set({ weightKg: 20, reps: 10, sessionLogId: 'a' }),
      set({ weightKg: 10, reps: 10, sessionLogId: 'b' }),
    ]

    expect(weeklySummaries(logs, sets, muscles)[0]?.totalVolumeKg).toBe(300)
  })

  it('is empty with no history', () => {
    expect(weeklySummaries([], [], muscles)).toEqual([])
  })
})
