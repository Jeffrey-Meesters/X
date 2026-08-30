import type { Program, SessionTemplate, Settings } from '@/types/models'
import type { BuildOptions } from '@/engine/segments'
import { EXERCISES_BY_ID } from '@/data/exercises'

/**
 * Seeded session templates.
 *
 * Timing per session totals 14:30, matching the table in spec section 2:
 *   warm-up   3 x 30s                              =  1:30
 *   circuit   4 exercises x 3 rounds x (40s + 20s) = 12:00
 *   finisher  1 core movement                      =  1:00
 */

export const SESSION_A: SessionTemplate = {
  id: 'session-a',
  name: 'Session A',
  warmup: [
    { exerciseId: 'bodyweight-squat', durationSec: 30 },
    { exerciseId: 'hip-hinge', durationSec: 30 },
    { exerciseId: 'arm-circles', durationSec: 30 },
  ],
  circuit: {
    rounds: 3,
    workSec: 40,
    transitionSec: 20,
    exercises: [
      { exerciseId: 'goblet-squat', targetReps: [8, 12] },
      { exerciseId: 'db-bench-press', targetReps: [8, 12] },
      { exerciseId: 'single-arm-row', targetReps: [8, 10] },
      { exerciseId: 'db-rdl', targetReps: [10, 12] },
    ],
  },
  finisher: { exerciseId: 'dead-bug', durationSec: 60 },
}

export const SESSION_B: SessionTemplate = {
  id: 'session-b',
  name: 'Session B',
  warmup: [
    { exerciseId: 'bodyweight-squat', durationSec: 30 },
    { exerciseId: 'hip-hinge', durationSec: 30 },
    { exerciseId: 'arm-circles', durationSec: 30 },
  ],
  circuit: {
    rounds: 3,
    workSec: 40,
    transitionSec: 20,
    exercises: [
      { exerciseId: 'db-reverse-lunge', targetReps: [6, 8] },
      { exerciseId: 'seated-shoulder-press', targetReps: [8, 12] },
      { exerciseId: 'bent-over-row', targetReps: [8, 12] },
      { exerciseId: 'db-chest-fly', targetReps: [10, 12] },
    ],
  },
  // 30s per side, so this expands to two segments with a switch cue between.
  finisher: { exerciseId: 'side-plank', durationSec: 30, perSide: true },
}

export const SESSION_TEMPLATES: readonly SessionTemplate[] = [SESSION_A, SESSION_B]

export const SESSIONS_BY_ID: ReadonlyMap<string, SessionTemplate> = new Map(
  SESSION_TEMPLATES.map((session) => [session.id, session]),
)

export function getSessionTemplate(id: string): SessionTemplate {
  const session = SESSIONS_BY_ID.get(id)
  if (!session) throw new Error(`Unknown session id: ${id}`)
  return session
}

export const PROGRAM: Program = {
  id: 'fullbody-15',
  name: '15-Minute Full Body',
  sessions: ['session-a', 'session-b'],
  rotation: 'alternating',
  daysPerWeek: 4,
}

/**
 * No-bench substitutions, applied across both sessions when the user answers
 * "no" to the bench question during onboarding (spec section 3.0).
 */
export const NO_BENCH_SUBSTITUTIONS: Readonly<Record<string, string>> = {
  'db-bench-press': 'db-floor-press',
  'single-arm-row': 'hinged-single-arm-row',
  'seated-shoulder-press': 'standing-shoulder-press',
  // The fly already defaults to the floor; the spec lists it as a no-bench
  // substitution target, so it is named here for completeness and is a no-op.
  'db-chest-fly': 'db-chest-fly',
}

/**
 * The substitution map for a user's equipment, or undefined when nothing needs
 * swapping. Shared so the home screen and the running session cannot disagree
 * about which exercises the user is actually going to do.
 */
export function substitutionsFor(hasBench: boolean): Readonly<Record<string, string>> | undefined {
  return hasBench ? undefined : NO_BENCH_SUBSTITUTIONS
}

/**
 * The exercise whose extra set replaces the finisher, per session.
 *
 * Only Session B has one: the option exists because 60 minutes of lifting a
 * week leaves shoulders on 6 direct sets, and Session B is where the shoulder
 * press lives (spec section 2). Session A has no shoulder movement to add to,
 * so the option is simply not offered there.
 */
export const EXTRA_SET_EXERCISE: Readonly<Record<string, string>> = {
  'session-b': 'seated-shoulder-press',
}

/** True when this session can trade its finisher for an extra set. */
export function supportsExtraSet(sessionId: string): boolean {
  return EXTRA_SET_EXERCISE[sessionId] !== undefined
}

/**
 * Every customisation that shapes a session, in one place.
 *
 * Shared by the home screen preview and the running session so the two cannot
 * disagree about what the user is about to do - the same reason
 * `substitutionsFor` exists.
 */
/**
 * Whether the user's equipment allows this movement at all.
 *
 * An id the library no longer has - renamed, or arriving from an import of an
 * older build - counts as unusable rather than throwing. A stale swap should
 * quietly fall back to the default movement, not take the app down on boot.
 */
function usable(exerciseId: string, hasBench: boolean): boolean {
  const exercise = EXERCISES_BY_ID.get(exerciseId)
  if (!exercise) return false
  return hasBench || !exercise.equipment.includes('bench')
}

/**
 * The swaps that still apply, given the equipment answer.
 *
 * Filtering matters because the two settings can contradict each other: swap
 * the bent-over row for the single-arm row, then answer "no bench", and an
 * unfiltered swap would keep prescribing a movement the user has just said
 * they cannot do - while the picker, which does filter, showed them something
 * else entirely.
 */
function applicableSwaps(settings: Settings): Record<string, string> {
  return Object.fromEntries(
    Object.entries(settings.exerciseSwaps).filter(([, chosen]) =>
      usable(chosen, settings.hasBench),
    ),
  )
}

export function buildOptionsFor(settings: Settings, sessionId: string): BuildOptions {
  const equipment = substitutionsFor(settings.hasBench)
  // Explicit choices win over inferred ones: someone who picked a movement in
  // customisation means it, whatever their bench answer implies.
  const substitutions = { ...equipment, ...applicableSwaps(settings) }

  const extraSetOf = settings.extraShoulderSet ? EXTRA_SET_EXERCISE[sessionId] : undefined

  return {
    leadIn: settings.leadIn,
    ...(Object.keys(substitutions).length > 0 ? { substitutions } : {}),
    circuit: {
      rounds: settings.rounds,
      workSec: settings.workSec,
      transitionSec: settings.transitionSec,
    },
    ...(extraSetOf === undefined ? {} : { replaceFinisherWithSetOf: extraSetOf }),
  }
}

/**
 * The exercise that will actually run in a template slot, after equipment
 * substitutions and customisation swaps.
 */
export function effectiveExerciseId(templateExerciseId: string, settings: Settings): string {
  const chosen = settings.exerciseSwaps[templateExerciseId]
  if (chosen !== undefined && usable(chosen, settings.hasBench)) return chosen
  return substitutionsFor(settings.hasBench)?.[templateExerciseId] ?? templateExerciseId
}
