/**
 * Data model for the 15-Minute Full-Body Dumbbell Trainer.
 *
 * Mirrors section 5 of the product spec. Two additions the spec implies but
 * does not state are marked EXTENSION below.
 */

export type Units = 'kg' | 'lb'
export type Theme = 'auto' | 'light' | 'dark'

export type ExerciseCategory = 'squat' | 'hinge' | 'push' | 'pull' | 'core' | 'warmup'
export type Equipment = 'dumbbell' | 'bench' | 'none'

/** Inclusive [min, max] rep target. */
export type RepRange = readonly [min: number, max: number]

export interface Exercise {
  readonly id: string
  readonly name: string
  readonly category: ExerciseCategory
  readonly equipment: readonly Equipment[]
  readonly primaryMuscles: readonly string[]
  readonly secondaryMuscles: readonly string[]
  /** Worked one side at a time, so reps are prescribed per side. */
  readonly unilateral: boolean
  /**
   * EXTENSION. Alternates sides continuously within a set (e.g. alternating
   * reverse lunge) rather than completing one side then the other.
   *
   * Distinct from `unilateral` because it governs the halfway side-switch cue:
   * spec section 7 asks for a midpoint beep on unilateral exercises, but a
   * mid-set beep during an alternating movement would be wrong. The cue fires
   * on `unilateral && !alternating`.
   */
  readonly alternating?: boolean
  readonly defaultRepRange: RepRange
  readonly cues: readonly string[]
  readonly commonMistakes: readonly string[]
  /** Exercise ids that can replace this one, in preference order. */
  readonly substitutions: readonly string[]
  readonly animation: { readonly type: 'svg'; readonly id: string }
}

export interface Program {
  readonly id: string
  readonly name: string
  readonly sessions: readonly string[]
  readonly rotation: 'alternating'
  readonly daysPerWeek: number
}

export interface WarmupItem {
  readonly exerciseId: string
  readonly durationSec: number
}

export interface CircuitExercise {
  readonly exerciseId: string
  readonly targetReps: RepRange
}

export interface Circuit {
  readonly rounds: number
  readonly workSec: number
  readonly transitionSec: number
  readonly exercises: readonly CircuitExercise[]
}

export interface Finisher {
  readonly exerciseId: string
  readonly durationSec: number
  /**
   * EXTENSION. When true, `durationSec` is per side and the finisher expands to
   * two segments with a switch cue between them. Needed for Session B's side
   * plank ("30 s per side"), which the flat shape in the spec cannot express.
   */
  readonly perSide?: boolean
}

export interface SessionTemplate {
  readonly id: string
  readonly name: string
  readonly warmup: readonly WarmupItem[]
  readonly circuit: Circuit
  readonly finisher: Finisher
}

export interface LoggedSet {
  readonly id: string
  readonly sessionLogId: string
  readonly exerciseId: string
  readonly round: number
  readonly weightKg: number
  readonly reps: number
  /** Reps in reserve. Null when the user has the optional selector switched off. */
  readonly rir: number | null
  readonly completedAt: string
}

export interface SessionLog {
  readonly id: string
  readonly programId: string
  readonly sessionId: string
  readonly startedAt: string
  readonly endedAt: string | null
  readonly completed: boolean
  readonly sets: readonly string[]
  /** Time actually spent counting down, excluding pauses. See spec section 6.5. */
  readonly workingTimeMs?: number
  /** Wall-clock duration including pauses, which plate changes make longer. */
  readonly totalElapsedMs?: number
}

export interface Settings {
  units: Units
  weightIncrement: number
  hasBench: boolean
  onboardingCompletedAt: string | null
  safetyAcknowledgedAt: string | null
  audioCues: boolean
  voiceAnnouncements: boolean
  haptics: boolean
  keepScreenAwake: boolean
  theme: Theme
  /** Optional 5-second countdown before the first movement. Spec section 3.1. */
  leadIn: boolean
  /** Show the reps-in-reserve selector during set logging. Off by default. */
  showRir: boolean
}

/** Autosaved for crash recovery. One row maximum. Spec section 3.0.1. */
export interface ActiveSession {
  readonly sessionLogId: string
  readonly sessionId: string
  readonly startedAt: string
  readonly segmentIndex: number
  readonly segmentStartedAt: number
  readonly pausedAccumulatedMs: number
  readonly isPaused: boolean
  readonly setsLogged: readonly string[]
}
