import { describe, it, expect } from 'vitest'
import { buildSegmentList, totalDurationMs, workSegments } from './segments'
import { SESSION_A, SESSION_B, buildOptionsFor, effectiveExerciseId } from '@/data/sessions'
import { DEFAULT_SETTINGS } from '@/stores/settings'
import type { Settings } from '@/types/models'

const DEFAULT_TOTAL_MS = 870_000

function settings(patch: Partial<Settings> = {}): Settings {
  return { ...DEFAULT_SETTINGS, exerciseSwaps: {}, leadIn: false, ...patch }
}

function build(template: typeof SESSION_A, patch: Partial<Settings> = {}) {
  const value = settings(patch)
  return buildSegmentList(template, { ...buildOptionsFor(value, template.id), leadIn: false })
}

describe('circuit overrides', () => {
  it('reproduces the seeded 14:30 session when nothing is customised', () => {
    expect(totalDurationMs(build(SESSION_A))).toBe(DEFAULT_TOTAL_MS)
    expect(totalDurationMs(build(SESSION_B))).toBe(DEFAULT_TOTAL_MS)
  })

  it('lengthens the session by exactly the added work time', () => {
    // 4 exercises x 3 rounds x 10 extra seconds.
    const longer = build(SESSION_A, { workSec: 50 })
    expect(totalDurationMs(longer)).toBe(DEFAULT_TOTAL_MS + 12 * 10_000)
  })

  it('adds a whole round of work and transitions', () => {
    const four = build(SESSION_A, { rounds: 4 })
    expect(workSegments(four)).toHaveLength(16)
    expect(totalDurationMs(four)).toBe(DEFAULT_TOTAL_MS + 4 * 60_000)
  })

  it('numbers rounds against the customised count, not the template', () => {
    const four = build(SESSION_A, { rounds: 4 })
    expect(workSegments(four).every((segment) => segment.totalRounds === 4)).toBe(true)
    expect(workSegments(four).at(-1)?.round).toBe(4)
  })

  it('shortens transitions without touching work', () => {
    const brisk = build(SESSION_A, { transitionSec: 10 })
    expect(totalDurationMs(brisk)).toBe(DEFAULT_TOTAL_MS - 12 * 10_000)
    expect(workSegments(brisk).every((s) => s.durationMs === 40_000)).toBe(true)
  })
})

describe('the finisher traded for a fourth shoulder set', () => {
  it('replaces Session B’s finisher with another shoulder press set', () => {
    const traded = build(SESSION_B, { extraShoulderSet: true })

    expect(traded.some((segment) => segment.type === 'finisher')).toBe(false)
    const shoulderSets = workSegments(traded).filter(
      (segment) => segment.exerciseId === 'seated-shoulder-press',
    )
    expect(shoulderSets).toHaveLength(4)
    expect(shoulderSets.at(-1)?.round).toBe(4)
    expect(shoulderSets.at(-1)?.totalRounds).toBe(4)
  })

  it('keeps the session the same length, which is the point of the trade', () => {
    // The side plank is 30 s per side; a work segment plus its transition is
    // 40 + 20. Spec section 2 offers this without changing session length.
    expect(totalDurationMs(build(SESSION_B, { extraShoulderSet: true }))).toBe(DEFAULT_TOTAL_MS)
  })

  it('gives the extra set a transition, so it can be logged at all', () => {
    const traded = build(SESSION_B, { extraShoulderSet: true })
    expect(traded.at(-1)?.type).toBe('transition')
    expect(traded.at(-1)?.exerciseId).toBe('seated-shoulder-press')
  })

  it('carries the rep range through, so the entry opens on a target', () => {
    const traded = build(SESSION_B, { extraShoulderSet: true })
    expect(workSegments(traded).at(-1)?.targetReps).toEqual([8, 12])
  })

  it('leaves Session A alone: it has no shoulder movement to add to', () => {
    const sessionA = build(SESSION_A, { extraShoulderSet: true })
    expect(sessionA.some((segment) => segment.type === 'finisher')).toBe(true)
    expect(totalDurationMs(sessionA)).toBe(DEFAULT_TOTAL_MS)
  })

  it('follows the equipment substitution, so a bench-less user presses standing', () => {
    const traded = build(SESSION_B, { extraShoulderSet: true, hasBench: false })
    expect(workSegments(traded).at(-1)?.exerciseId).toBe('standing-shoulder-press')
  })
})

describe('exercise swaps', () => {
  it('replaces the movement everywhere it appears in the session', () => {
    const swapped = build(SESSION_A, { exerciseSwaps: { 'goblet-squat': 'split-squat' } })
    expect(workSegments(swapped).filter((s) => s.exerciseId === 'split-squat')).toHaveLength(3)
    expect(workSegments(swapped).some((s) => s.exerciseId === 'goblet-squat')).toBe(false)
  })

  it('recomputes the halfway cue for the movement that actually runs', () => {
    // The goblet squat needs no side-switch cue; the split squat is unilateral
    // and does. Reading the cue off the template would get this backwards.
    const swapped = build(SESSION_A, { exerciseSwaps: { 'goblet-squat': 'split-squat' } })
    expect(workSegments(swapped)[0]?.halfwayCue).toBe(true)
    expect(workSegments(build(SESSION_A))[0]?.halfwayCue).toBe(false)
  })

  it('lets an explicit choice beat the equipment substitution', () => {
    const value = settings({
      hasBench: false,
      exerciseSwaps: { 'db-bench-press': 'db-squeeze-press' },
    })
    expect(effectiveExerciseId('db-bench-press', value)).toBe('db-squeeze-press')

    const built = build(SESSION_A, {
      hasBench: false,
      exerciseSwaps: { 'db-bench-press': 'db-squeeze-press' },
    })
    expect(workSegments(built).some((s) => s.exerciseId === 'db-squeeze-press')).toBe(true)
    expect(workSegments(built).some((s) => s.exerciseId === 'db-floor-press')).toBe(false)
  })

  it('falls back to the equipment substitution where there is no explicit choice', () => {
    expect(effectiveExerciseId('db-bench-press', settings({ hasBench: false }))).toBe(
      'db-floor-press',
    )
    expect(effectiveExerciseId('db-bench-press', settings({ hasBench: true }))).toBe(
      'db-bench-press',
    )
  })

  it('drops a swap the equipment no longer allows, rather than prescribing it', () => {
    // Swap the bent-over row for the single-arm row, then answer "no bench".
    // The picker stops offering it; the session has to agree, or the app shows
    // one movement and runs another.
    const patch = {
      hasBench: false,
      exerciseSwaps: { 'bent-over-row': 'single-arm-row' },
    }
    expect(effectiveExerciseId('bent-over-row', settings(patch))).toBe('bent-over-row')
    expect(
      workSegments(build(SESSION_B, patch)).some((s) => s.exerciseId === 'single-arm-row'),
    ).toBe(false)

    // With a bench it is a perfectly good choice, and still applies.
    const withBench = { hasBench: true, exerciseSwaps: { 'bent-over-row': 'single-arm-row' } }
    expect(effectiveExerciseId('bent-over-row', settings(withBench))).toBe('single-arm-row')
  })

  it('ignores a swap to an exercise the library no longer has', () => {
    // Reachable from an import written by an older build. Falling back beats
    // throwing out of a computed on the home screen.
    const patch = { exerciseSwaps: { 'goblet-squat': 'kettlebell-swing' } }
    expect(effectiveExerciseId('goblet-squat', settings(patch))).toBe('goblet-squat')
    expect(() => build(SESSION_A, patch)).not.toThrow()
  })

  it('combines with a changed circuit shape rather than overriding it', () => {
    const both = build(SESSION_A, {
      rounds: 2,
      exerciseSwaps: { 'db-rdl': 'single-leg-rdl' },
    })
    expect(workSegments(both)).toHaveLength(8)
    expect(workSegments(both).filter((s) => s.exerciseId === 'single-leg-rdl')).toHaveLength(2)
  })
})
