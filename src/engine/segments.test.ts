import { describe, it, expect } from 'vitest'
import { buildSegmentList, totalDurationMs, nextExerciseSegment, workSegments, LEAD_IN_MS } from './segments'
import { SESSION_A, SESSION_B, NO_BENCH_SUBSTITUTIONS } from '@/data/sessions'
import { EXERCISES, EXERCISES_BY_ID } from '@/data/exercises'

describe('buildSegmentList', () => {
  it('produces the structure the spec timing table describes', () => {
    const segments = buildSegmentList(SESSION_A)

    // 3 warm-up + (4 exercises x 3 rounds x 2 segments) + 1 finisher
    expect(segments).toHaveLength(3 + 24 + 1)
    expect(segments.filter((s) => s.type === 'warmup')).toHaveLength(3)
    expect(segments.filter((s) => s.type === 'work')).toHaveLength(12)
    expect(segments.filter((s) => s.type === 'transition')).toHaveLength(12)
    expect(segments.filter((s) => s.type === 'finisher')).toHaveLength(1)
  })

  it('totals 14:30 for both sessions', () => {
    // 1:30 warm-up + 12:00 circuit + 1:00 finisher
    const expected = (90 + 720 + 60) * 1000
    expect(totalDurationMs(buildSegmentList(SESSION_A))).toBe(expected)
    expect(totalDurationMs(buildSegmentList(SESSION_B))).toBe(expected)
  })

  it('indexes segments contiguously from zero', () => {
    const segments = buildSegmentList(SESSION_A)
    segments.forEach((segment, i) => expect(segment.index).toBe(i))
  })

  it('adds the lead-in outside the nominal session length', () => {
    const withLeadIn = buildSegmentList(SESSION_A, { leadIn: true })
    const without = buildSegmentList(SESSION_A)

    expect(withLeadIn).toHaveLength(without.length + 1)
    expect(withLeadIn[0]?.type).toBe('lead-in')
    expect(totalDurationMs(withLeadIn) - totalDurationMs(without)).toBe(LEAD_IN_MS)
  })

  it('follows every work segment with a transition, including the very last', () => {
    const segments = buildSegmentList(SESSION_A)
    for (const segment of segments) {
      if (segment.type !== 'work') continue
      expect(segments[segment.index + 1]?.type).toBe('transition')
    }
  })

  it('rotates the circuit rather than running straight sets', () => {
    const order = buildSegmentList(SESSION_A)
      .filter((s) => s.type === 'work')
      .map((s) => s.exerciseId)

    // Each round runs all four exercises before repeating any of them.
    expect(order.slice(0, 4)).toEqual(['goblet-squat', 'db-bench-press', 'single-arm-row', 'db-rdl'])
    expect(order.slice(4, 8)).toEqual(order.slice(0, 4))
    expect(order.slice(8, 12)).toEqual(order.slice(0, 4))
  })

  it('numbers rounds 1-based and carries the total', () => {
    const work = buildSegmentList(SESSION_A).filter((s) => s.type === 'work')
    expect(work.map((s) => s.round)).toEqual([1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3])
    expect(work.every((s) => s.totalRounds === 3)).toBe(true)
  })

  it('splits a per-side finisher into two segments', () => {
    const finishers = buildSegmentList(SESSION_B).filter((s) => s.type === 'finisher')

    expect(finishers).toHaveLength(2)
    expect(finishers.map((s) => s.side)).toEqual(['left', 'right'])
    expect(finishers.every((s) => s.durationMs === 30_000)).toBe(true)
  })

  it('keeps a single-segment finisher single', () => {
    const finishers = buildSegmentList(SESSION_A).filter((s) => s.type === 'finisher')
    expect(finishers).toHaveLength(1)
    expect(finishers[0]?.side).toBeUndefined()
    expect(finishers[0]?.durationMs).toBe(60_000)
  })
})

describe('halfway side-switch cue', () => {
  it('fires for a unilateral exercise worked one side then the other', () => {
    const row = buildSegmentList(SESSION_A).find(
      (s) => s.type === 'work' && s.exerciseId === 'single-arm-row',
    )
    expect(row?.halfwayCue).toBe(true)
  })

  it('does NOT fire for an alternating movement', () => {
    // The reverse lunge is unilateral but alternates every rep, so a midpoint
    // beep would be telling the user to do what they are already doing.
    const lunge = buildSegmentList(SESSION_B).find(
      (s) => s.type === 'work' && s.exerciseId === 'db-reverse-lunge',
    )
    expect(EXERCISES_BY_ID.get('db-reverse-lunge')?.unilateral).toBe(true)
    expect(lunge?.halfwayCue).toBe(false)
  })

  it('never fires on rest, warm-up or finisher segments', () => {
    const segments = [...buildSegmentList(SESSION_A), ...buildSegmentList(SESSION_B)]
    for (const segment of segments) {
      if (segment.type !== 'work') expect(segment.halfwayCue).toBe(false)
    }
  })
})

describe('substitutions', () => {
  it('applies the no-bench swaps without changing session length', () => {
    const standard = buildSegmentList(SESSION_A)
    const noBench = buildSegmentList(SESSION_A, { substitutions: NO_BENCH_SUBSTITUTIONS })

    expect(noBench).toHaveLength(standard.length)
    expect(totalDurationMs(noBench)).toBe(totalDurationMs(standard))
    expect(noBench.some((s) => s.exerciseId === 'db-floor-press')).toBe(true)
    expect(noBench.some((s) => s.exerciseId === 'db-bench-press')).toBe(false)
  })

  it('recomputes the halfway cue against the substituted exercise', () => {
    const noBench = buildSegmentList(SESSION_A, { substitutions: NO_BENCH_SUBSTITUTIONS })
    const row = noBench.find((s) => s.type === 'work' && s.exerciseId === 'hinged-single-arm-row')

    // The substitute is still unilateral, so the cue must survive the swap.
    expect(row?.halfwayCue).toBe(true)
  })

  it('removes every bench requirement when the user has no bench', () => {
    const noBench = buildSegmentList(SESSION_A, { substitutions: NO_BENCH_SUBSTITUTIONS })
    for (const segment of noBench) {
      const exercise = EXERCISES_BY_ID.get(segment.exerciseId)
      expect(exercise?.equipment).not.toContain('bench')
    }
  })
})

describe('helpers', () => {
  it('previews the next real exercise, skipping the transition', () => {
    const segments = buildSegmentList(SESSION_A)
    const firstWork = segments.find((s) => s.type === 'work')!

    const preview = nextExerciseSegment(segments, firstWork.index)
    expect(preview?.type).toBe('work')
    expect(preview?.exerciseId).toBe('db-bench-press')
  })

  it('returns undefined past the end of the session', () => {
    const segments = buildSegmentList(SESSION_A)
    expect(nextExerciseSegment(segments, segments.length - 1)).toBeUndefined()
  })

  it('counts 12 working sets per session, 48 across a 4-day week', () => {
    const perSession = workSegments(buildSegmentList(SESSION_A)).length
    expect(perSession).toBe(12)
    // 2 x A + 2 x B, matching the weekly volume table in spec section 2.
    expect(perSession * 4).toBe(48)
  })
})

describe('seed data integrity', () => {
  it('resolves every exercise referenced by either session', () => {
    for (const template of [SESSION_A, SESSION_B]) {
      const ids = [
        ...template.warmup.map((w) => w.exerciseId),
        ...template.circuit.exercises.map((e) => e.exerciseId),
        template.finisher.exerciseId,
      ]
      for (const id of ids) expect(EXERCISES_BY_ID.has(id)).toBe(true)
    }
  })

  it('resolves every substitution to a real exercise', () => {
    for (const exercise of EXERCISES) {
      for (const id of exercise.substitutions) {
        expect(EXERCISES_BY_ID.has(id)).toBe(true)
      }
    }
  })

  it('has unique exercise ids', () => {
    const ids = EXERCISES.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('gives every exercise cues and mistakes for the detail panel', () => {
    for (const exercise of EXERCISES) {
      expect(exercise.cues.length).toBeGreaterThan(0)
      expect(exercise.commonMistakes.length).toBeGreaterThan(0)
      expect(exercise.primaryMuscles.length).toBeGreaterThan(0)
    }
  })

  it('orders every rep range low to high', () => {
    for (const exercise of EXERCISES) {
      const [min, max] = exercise.defaultRepRange
      expect(min).toBeLessThanOrEqual(max)
    }
  })
})
