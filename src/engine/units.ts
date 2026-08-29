import type { Units } from '@/types/models'

/**
 * Weight conversion and stepper arithmetic.
 *
 * Kilograms are canonical: the logged-set model stores `weightKg`, so every
 * comparison, total and chart works in one unit. Pounds exist only at the edges,
 * for display and for the stepper.
 *
 * The subtlety worth guarding: stepper arithmetic happens in *display* units,
 * not by converting an increment into kilograms and adding it. Adding a
 * converted 5 lb repeatedly accumulates float error, so after a dozen taps a
 * user in pounds sees 47.4 where they expect 50.
 */

export const KG_PER_LB = 0.45359237

/** Calibration floor for a first session (spec section 3.3). */
export const WEIGHT_FLOOR_KG = 5
export const WEIGHT_FLOOR_LB = 10

/**
 * Stored precision.
 *
 * Eight decimals, not four: the pounds-to-kilograms factor has eight decimal
 * digits, so rounding a converted weight any shorter loses pound fidelity.
 * 10 lb stored at four decimals reads back as 9.99995 lb. This is still short
 * enough to erase ordinary float noise.
 */
const KG_PRECISION = 8

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals
  // The +Number.EPSILON nudge stops 1.005 style values rounding down.
  return Math.round((value + Number.EPSILON) * factor) / factor
}

export function lbToKg(lb: number): number {
  return round(lb * KG_PER_LB, KG_PRECISION)
}

export function kgToLb(kg: number): number {
  return kg / KG_PER_LB
}

/** Canonical kilograms to the number shown in the user's chosen unit. */
export function toDisplay(weightKg: number, units: Units): number {
  return units === 'kg' ? weightKg : kgToLb(weightKg)
}

/** A number the user entered or stepped, back to canonical kilograms. */
export function fromDisplay(value: number, units: Units): number {
  return units === 'kg' ? round(value, KG_PRECISION) : lbToKg(value)
}

/** One decimal place, trailing zero trimmed: 20, 22.5, 47.5. */
export function formatWeight(weightKg: number, units: Units): string {
  const value = toDisplay(weightKg, units)
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

export function formatWeightWithUnit(weightKg: number, units: Units): string {
  return `${formatWeight(weightKg, units)} ${units}`
}

/** Snap a display-unit value onto the increment grid. */
function snap(value: number, increment: number): number {
  if (increment <= 0) return value
  return round(Math.round(value / increment) * increment, 3)
}

/**
 * Step the weight by one increment in display units.
 *
 * `increment` is expressed in the user's units (2.5 kg or 5 lb), which is how
 * the setting is stored and how the plates actually come.
 */
export function stepWeight(
  weightKg: number,
  increment: number,
  direction: 1 | -1,
  units: Units,
): number {
  const current = toDisplay(weightKg, units)
  // Snap first so a value arrived at by another route still lands on the grid.
  const stepped = snap(current, increment) + direction * increment
  return fromDisplay(Math.max(0, round(stepped, 3)), units)
}

/** The starting weight for an exercise with no history (spec section 3.3). */
export function calibrationFloor(units: Units): number {
  return units === 'kg' ? WEIGHT_FLOOR_KG : lbToKg(WEIGHT_FLOOR_LB)
}

/** Total volume in kilograms: weight times reps, summed. */
export function totalVolumeKg(sets: readonly { weightKg: number; reps: number }[]): number {
  return round(
    sets.reduce((sum, set) => sum + set.weightKg * set.reps, 0),
    KG_PRECISION,
  )
}

/**
 * Epley estimate of a one-rep max, used only for the history view.
 * Deliberately not fed back into any weight suggestion.
 */
export function estimateOneRepMax(weightKg: number, reps: number): number {
  if (reps <= 0) return 0
  if (reps === 1) return weightKg
  return round(weightKg * (1 + reps / 30), 2)
}
