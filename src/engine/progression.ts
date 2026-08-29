import type { LoggedSet, RepRange, Units } from '@/types/models'
import { calibrationFloor, stepWeight } from './units'

/**
 * Double progression and the first-sessions ramp-up (spec section 2 and 3.3).
 *
 * Pure functions over logged sets. Nothing here touches storage or the clock,
 * so every threshold is directly testable.
 */

/** Sessions during which a doubled increment is offered. Spec section 3.3. */
export const RAMP_UP_SESSION_COUNT = 3

export interface PrefillInput {
  /** Sets for this exercise from the user's most recent session with it. */
  readonly lastSessionSets: readonly LoggedSet[]
  readonly units: Units
}

/**
 * The weight the entry field opens on.
 *
 * With no history this is an explicit calibration floor rather than a guess
 * from bodyweight, which predicts upper-body strength poorly and would anchor
 * beginners too high.
 */
export function prefillWeightKg(input: PrefillInput): number {
  const { lastSessionSets, units } = input
  if (lastSessionSets.length === 0) return calibrationFloor(units)

  // The heaviest set of the last session, so a user who worked up within a
  // session does not get dragged back to their opening weight.
  return Math.max(...lastSessionSets.map((set) => set.weightKg))
}

export function isCalibrationSession(completedSessionCount: number): boolean {
  return completedSessionCount === 0
}

/**
 * True when every logged round reached the top of the prescribed range *and*
 * the user confirmed it.
 *
 * The confirmation requirement is what stops the passive path inflating load.
 * Reps default to the top of the range, so a user who never touches the entry
 * would otherwise satisfy this condition every single session and be offered a
 * heavier weight each time, purely from numbers the app filled in itself.
 */
export function hitTopOfRange(sets: readonly LoggedSet[], range: RepRange, rounds: number): boolean {
  if (sets.length < rounds) return false
  const [, top] = range
  return sets.every((set) => set.confirmed && set.reps >= top)
}

export interface SuggestionInput {
  readonly sets: readonly LoggedSet[]
  readonly targetReps: RepRange
  readonly rounds: number
  readonly units: Units
  readonly increment: number
  /** How many sessions the user has completed before this one. */
  readonly completedSessionCount: number
  /** True when the user never touched the pre-filled weight during the session. */
  readonly prefillUntouched: boolean
}

export interface Suggestion {
  readonly currentWeightKg: number
  readonly suggestedWeightKg: number
  /** 1 for a normal increment, 2 during the ramp-up. */
  readonly steps: number
}

/**
 * Weight suggestion for the next session, or undefined when nothing changes.
 *
 * Double progression: hitting the top of the rep range on every round earns one
 * increment. During the first few sessions a user who also left the pre-filled
 * weight alone earns two, because someone starting at the 5 kg floor would
 * otherwise spend two months climbing to a working weight.
 */
export function suggestProgression(input: SuggestionInput): Suggestion | undefined {
  const { sets, targetReps, rounds, units, increment, completedSessionCount, prefillUntouched } =
    input

  if (!hitTopOfRange(sets, targetReps, rounds)) return undefined

  const currentWeightKg = Math.max(...sets.map((set) => set.weightKg))
  const rampingUp = completedSessionCount < RAMP_UP_SESSION_COUNT && prefillUntouched
  const steps = rampingUp ? 2 : 1

  let suggestedWeightKg = currentWeightKg
  for (let i = 0; i < steps; i += 1) {
    suggestedWeightKg = stepWeight(suggestedWeightKg, increment, 1, units)
  }

  return { currentWeightKg, suggestedWeightKg, steps }
}

/** Sets per muscle group across a set of logged sets, for the weekly summary. */
export function setsPerMuscleGroup(
  sets: readonly LoggedSet[],
  primaryMusclesFor: (exerciseId: string) => readonly string[],
): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const set of sets) {
    for (const muscle of primaryMusclesFor(set.exerciseId)) {
      counts[muscle] = (counts[muscle] ?? 0) + 1
    }
  }
  return counts
}
