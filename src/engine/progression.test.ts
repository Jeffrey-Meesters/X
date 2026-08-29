import { describe, it, expect } from 'vitest'
import {
  prefillWeightKg,
  hitTopOfRange,
  suggestProgression,
  isCalibrationSession,
  setsPerMuscleGroup,
} from './progression'
import { calibrationFloor, lbToKg, toDisplay } from './units'
import type { LoggedSet } from '@/types/models'

function set(
  weightKg: number,
  reps: number,
  exerciseId = 'goblet-squat',
  confirmed = true,
): LoggedSet {
  return {
    id: crypto.randomUUID(),
    sessionLogId: 'log-1',
    exerciseId,
    round: 1,
    weightKg,
    reps,
    rir: null,
    confirmed,
    completedAt: '2026-08-29T09:00:00.000Z',
  }
}

/** A set the countdown committed on its own, with nothing the user entered. */
const passive = (weightKg: number, reps: number) => set(weightKg, reps, 'goblet-squat', false)

describe('prefill', () => {
  it('falls back to the calibration floor with no history', () => {
    expect(prefillWeightKg({ lastSessionSets: [], units: 'kg' })).toBe(calibrationFloor('kg'))
  })

  it('uses the heaviest set of the last session', () => {
    // A user who worked up mid-session should not be dragged back down.
    const weight = prefillWeightKg({
      lastSessionSets: [set(20, 12), set(22.5, 10), set(22.5, 9)],
      units: 'kg',
    })
    expect(weight).toBe(22.5)
  })

  it('uses the pound floor for pound users', () => {
    const weight = prefillWeightKg({ lastSessionSets: [], units: 'lb' })
    expect(toDisplay(weight, 'lb')).toBeCloseTo(10, 6)
  })
})

describe('hitting the top of the range', () => {
  it('is true only when every round reached the top', () => {
    expect(hitTopOfRange([set(20, 12), set(20, 12), set(20, 12)], [8, 12], 3)).toBe(true)
    expect(hitTopOfRange([set(20, 12), set(20, 11), set(20, 12)], [8, 12], 3)).toBe(false)
  })

  it('is false when a round was not logged at all', () => {
    expect(hitTopOfRange([set(20, 12), set(20, 12)], [8, 12], 3)).toBe(false)
  })

  it('counts exceeding the top as hitting it', () => {
    expect(hitTopOfRange([set(20, 14), set(20, 13), set(20, 12)], [8, 12], 3)).toBe(true)
  })

  it('does not count sets the user never confirmed', () => {
    // Reps default to the top of the range, so a passively logged set always
    // reads as a clean sweep. Treating that as evidence would offer a heavier
    // weight every session off numbers the app filled in itself.
    expect(hitTopOfRange([passive(20, 12), passive(20, 12), passive(20, 12)], [8, 12], 3)).toBe(
      false,
    )
  })

  it('needs every round confirmed, not just one', () => {
    expect(hitTopOfRange([set(20, 12), passive(20, 12), set(20, 12)], [8, 12], 3)).toBe(false)
  })
})

describe('progression suggestions', () => {
  const base = {
    targetReps: [8, 12] as const,
    rounds: 3,
    units: 'kg' as const,
    increment: 2.5,
  }

  it('offers nothing when the range was not cleared', () => {
    const suggestion = suggestProgression({
      ...base,
      sets: [set(20, 12), set(20, 10), set(20, 12)],
      completedSessionCount: 10,
      prefillUntouched: true,
    })
    expect(suggestion).toBeUndefined()
  })

  it('offers nothing when the whole session was logged passively', () => {
    // The headline rule: the passive path must never inflate the weight.
    const suggestion = suggestProgression({
      ...base,
      sets: [passive(20, 12), passive(20, 12), passive(20, 12)],
      completedSessionCount: 10,
      prefillUntouched: true,
    })
    expect(suggestion).toBeUndefined()
  })

  it('offers one increment once the range is cleared', () => {
    const suggestion = suggestProgression({
      ...base,
      sets: [set(20, 12), set(20, 12), set(20, 12)],
      completedSessionCount: 10,
      prefillUntouched: true,
    })
    expect(suggestion).toEqual({ currentWeightKg: 20, suggestedWeightKg: 22.5, steps: 1 })
  })

  it('offers a double increment during the ramp-up', () => {
    // Otherwise someone starting at the 5 kg floor spends two months climbing
    // to a working weight.
    const suggestion = suggestProgression({
      ...base,
      sets: [set(5, 12), set(5, 12), set(5, 12)],
      completedSessionCount: 1,
      prefillUntouched: true,
    })
    expect(suggestion?.steps).toBe(2)
    expect(suggestion?.suggestedWeightKg).toBe(10)
  })

  it('does not double when the user already adjusted the weight themselves', () => {
    const suggestion = suggestProgression({
      ...base,
      sets: [set(20, 12), set(20, 12), set(20, 12)],
      completedSessionCount: 1,
      prefillUntouched: false,
    })
    expect(suggestion?.steps).toBe(1)
  })

  it('stops doubling once the ramp-up window closes', () => {
    const suggestion = suggestProgression({
      ...base,
      sets: [set(20, 12), set(20, 12), set(20, 12)],
      completedSessionCount: 3,
      prefillUntouched: true,
    })
    expect(suggestion?.steps).toBe(1)
  })

  it('steps in display units for pound users', () => {
    const start = lbToKg(20)
    const suggestion = suggestProgression({
      ...base,
      units: 'lb',
      increment: 5,
      sets: [set(start, 12), set(start, 12), set(start, 12)],
      completedSessionCount: 10,
      prefillUntouched: true,
    })
    expect(toDisplay(suggestion!.suggestedWeightKg, 'lb')).toBeCloseTo(25, 6)
  })
})

describe('calibration session', () => {
  it('is only the very first one', () => {
    expect(isCalibrationSession(0)).toBe(true)
    expect(isCalibrationSession(1)).toBe(false)
  })
})

describe('sets per muscle group', () => {
  it('counts a set against each of its primary muscles', () => {
    const counts = setsPerMuscleGroup(
      [set(20, 10, 'goblet-squat'), set(20, 10, 'goblet-squat'), set(20, 10, 'db-bench-press')],
      (id) => (id === 'goblet-squat' ? ['quads', 'glutes'] : ['chest']),
    )
    expect(counts).toEqual({ quads: 2, glutes: 2, chest: 1 })
  })
})
