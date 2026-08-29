import type { Program, SessionTemplate } from '@/types/models'

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
