import type { RepRange, SessionTemplate } from '@/types/models'
import { getExercise } from '@/data/exercises'

/**
 * Pre-computes a whole session as a flat segment list (spec section 6.1).
 * Everything downstream — the timer, the player UI, set logging — is just an
 * index into this list.
 *
 * This module is pure TypeScript with no Vue or Pinia dependency.
 */

export type SegmentType = 'lead-in' | 'warmup' | 'work' | 'transition' | 'finisher'

export interface Segment {
  /** Position in the session's flat list. */
  readonly index: number
  readonly type: SegmentType
  readonly exerciseId: string
  readonly durationMs: number
  /** 1-based round number. Circuit segments only. */
  readonly round?: number
  readonly totalRounds?: number
  /** Set on per-side finishers so the UI can say which side. */
  readonly side?: 'left' | 'right'
  /** Work segments only. */
  readonly targetReps?: RepRange
  /**
   * Emit a side-switch cue at the midpoint of this segment.
   *
   * True for unilateral exercises that are worked one side then the other, and
   * deliberately false for alternating movements, where a mid-set beep would
   * tell the user to do something they are already doing every rep.
   */
  readonly halfwayCue: boolean
}

export const LEAD_IN_MS = 5_000

export interface BuildOptions {
  /** Prepend the optional 5-second lead-in countdown (spec section 3.1). */
  readonly leadIn?: boolean
  /**
   * Exercise id remapping, used by the no-bench onboarding answer and by
   * per-exercise swaps in customisation.
   */
  readonly substitutions?: Readonly<Record<string, string>>
  /**
   * Circuit shape overrides from customisation (spec section 3.6). Each falls
   * back to the template's own value, so the seeded templates stay the single
   * definition of the default program.
   */
  readonly circuit?: {
    readonly rounds?: number
    readonly workSec?: number
    readonly transitionSec?: number
  }
  /**
   * Replace the finisher with one more set of this exercise (spec section 2's
   * "fourth shoulder set" option).
   *
   * Expressed as an exercise id rather than a boolean because the engine has
   * no business knowing which slot of which session counts as the shoulder
   * one - that belongs with the template.
   */
  readonly replaceFinisherWithSetOf?: string
}

function substitute(
  exerciseId: string,
  substitutions: Readonly<Record<string, string>> | undefined,
): string {
  return substitutions?.[exerciseId] ?? exerciseId
}

/** True when a midpoint side-switch cue is appropriate for this exercise. */
export function wantsHalfwayCue(exerciseId: string): boolean {
  const exercise = getExercise(exerciseId)
  return exercise.unilateral && exercise.alternating !== true
}

export function buildSegmentList(
  template: SessionTemplate,
  options: BuildOptions = {},
): readonly Segment[] {
  const { leadIn = false, substitutions, circuit: overrides } = options
  const segments: Segment[] = []

  const push = (segment: Omit<Segment, 'index'>): void => {
    segments.push({ ...segment, index: segments.length })
  }

  if (leadIn) {
    const firstWarmup = template.warmup[0]
    push({
      type: 'lead-in',
      exerciseId: firstWarmup ? substitute(firstWarmup.exerciseId, substitutions) : '',
      durationMs: LEAD_IN_MS,
      halfwayCue: false,
    })
  }

  for (const item of template.warmup) {
    push({
      type: 'warmup',
      exerciseId: substitute(item.exerciseId, substitutions),
      durationMs: item.durationSec * 1000,
      halfwayCue: false,
    })
  }

  const { exercises } = template.circuit
  const rounds = overrides?.rounds ?? template.circuit.rounds
  const workSec = overrides?.workSec ?? template.circuit.workSec
  const transitionSec = overrides?.transitionSec ?? template.circuit.transitionSec

  const pushSet = (entry: { exerciseId: string; targetReps: RepRange }, round: number, of: number) => {
    const exerciseId = substitute(entry.exerciseId, substitutions)
    push({
      type: 'work',
      exerciseId,
      durationMs: workSec * 1000,
      round,
      totalRounds: of,
      targetReps: entry.targetReps,
      halfwayCue: wantsHalfwayCue(exerciseId),
    })
    // Every work segment is followed by a transition, including the last one
    // in the last round: that is where its set gets logged (spec section 3.3).
    push({
      type: 'transition',
      exerciseId,
      durationMs: transitionSec * 1000,
      round,
      totalRounds: of,
      halfwayCue: false,
    })
  }

  for (let round = 1; round <= rounds; round += 1) {
    for (const entry of exercises) {
      pushSet(entry, round, rounds)
    }
  }

  const extraSetOf = options.replaceFinisherWithSetOf
  if (extraSetOf !== undefined) {
    const entry = exercises.find((item) => item.exerciseId === extraSetOf)
    if (entry) {
      // Counted as an extra round of that one exercise, not of the circuit:
      // it really is its fourth set, and the progression rule reads the number
      // of sets for an exercise rather than the circuit's round count.
      pushSet(entry, rounds + 1, rounds + 1)
      return segments
    }
  }

  const finisherId = substitute(template.finisher.exerciseId, substitutions)
  if (template.finisher.perSide === true) {
    for (const side of ['left', 'right'] as const) {
      push({
        type: 'finisher',
        exerciseId: finisherId,
        durationMs: template.finisher.durationSec * 1000,
        side,
        halfwayCue: false,
      })
    }
  } else {
    push({
      type: 'finisher',
      exerciseId: finisherId,
      durationMs: template.finisher.durationSec * 1000,
      halfwayCue: false,
    })
  }

  return segments
}

export function totalDurationMs(segments: readonly Segment[]): number {
  return segments.reduce((total, segment) => total + segment.durationMs, 0)
}

/** The next segment the user should be shown a preview of, skipping transitions. */
export function nextExerciseSegment(
  segments: readonly Segment[],
  fromIndex: number,
): Segment | undefined {
  for (let i = fromIndex + 1; i < segments.length; i += 1) {
    const segment = segments[i]
    if (segment && segment.type !== 'transition') return segment
  }
  return undefined
}

/** Working sets in the list, i.e. what counts toward volume. */
export function workSegments(segments: readonly Segment[]): readonly Segment[] {
  return segments.filter((segment) => segment.type === 'work')
}
