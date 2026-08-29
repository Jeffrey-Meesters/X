import type { LoggedSet, RepRange, SessionLog } from '@/types/models'
import { estimateOneRepMax, totalVolumeKg } from './units'

/**
 * Session and weekly aggregation.
 *
 * Pure functions over logged sets, with no storage or clock of their own, so
 * every number the summary and history screens show is directly testable.
 */

export interface ExerciseOutcome {
  readonly exerciseId: string
  readonly sets: readonly LoggedSet[]
  readonly topWeightKg: number
  readonly totalReps: number
  /** Every round reached the top of the range *and* the user confirmed them. */
  readonly clearedRange: boolean
}

export interface SessionSummary {
  readonly setsCompleted: number
  readonly totalVolumeKg: number
  readonly exercises: readonly ExerciseOutcome[]
  /** Exercises where the range was cleared, i.e. progression candidates. */
  readonly cleared: readonly ExerciseOutcome[]
}

/**
 * Groups a session's sets by exercise, preserving the order they were first
 * performed so the summary reads in the order the user did them.
 */
export function summariseSession(
  sets: readonly LoggedSet[],
  targetFor: (exerciseId: string) => RepRange | undefined,
  roundsFor: (exerciseId: string) => number,
): SessionSummary {
  const order: string[] = []
  const grouped = new Map<string, LoggedSet[]>()

  for (const set of sets) {
    if (!grouped.has(set.exerciseId)) {
      grouped.set(set.exerciseId, [])
      order.push(set.exerciseId)
    }
    grouped.get(set.exerciseId)!.push(set)
  }

  const exercises: ExerciseOutcome[] = order.map((exerciseId) => {
    const group = grouped.get(exerciseId) ?? []
    const range = targetFor(exerciseId)
    const rounds = roundsFor(exerciseId)

    const clearedRange =
      range !== undefined &&
      group.length >= rounds &&
      // Same confirmation requirement as progression: an untouched auto-commit
      // records the target reps by default, which is not evidence of anything.
      group.every((set) => set.confirmed && set.reps >= range[1])

    return {
      exerciseId,
      sets: group,
      topWeightKg: group.length > 0 ? Math.max(...group.map((s) => s.weightKg)) : 0,
      totalReps: group.reduce((sum, s) => sum + s.reps, 0),
      clearedRange,
    }
  })

  return {
    setsCompleted: sets.length,
    totalVolumeKg: totalVolumeKg(sets),
    exercises,
    cleared: exercises.filter((e) => e.clearedRange),
  }
}

/** One point on a per-exercise history chart: the best set of a session. */
export interface ExercisePoint {
  readonly sessionLogId: string
  readonly date: string
  readonly topWeightKg: number
  readonly repsAtTopWeight: number
  readonly volumeKg: number
  readonly estimatedOneRepMaxKg: number
}

/**
 * Per-exercise history, oldest first, one point per session.
 *
 * Reduced to the best set of each session rather than every set: a chart of
 * every set of every session is noise at this scale, and the question the user
 * is asking is whether the working weight is going up.
 */
export function exerciseHistory(
  sets: readonly LoggedSet[],
  logs: readonly SessionLog[],
  exerciseId: string,
): readonly ExercisePoint[] {
  const byLog = new Map<string, LoggedSet[]>()
  for (const set of sets) {
    if (set.exerciseId !== exerciseId) continue
    const list = byLog.get(set.sessionLogId) ?? []
    list.push(set)
    byLog.set(set.sessionLogId, list)
  }

  const dateFor = new Map(logs.map((log) => [log.id, log.startedAt]))

  return [...byLog.entries()]
    .map(([sessionLogId, group]) => {
      const topWeightKg = Math.max(...group.map((s) => s.weightKg))
      // Reps at the heaviest set, taking the best if it was done more than once.
      const repsAtTopWeight = Math.max(
        ...group.filter((s) => s.weightKg === topWeightKg).map((s) => s.reps),
      )
      return {
        sessionLogId,
        date: dateFor.get(sessionLogId) ?? group[0]?.completedAt ?? '',
        topWeightKg,
        repsAtTopWeight,
        volumeKg: totalVolumeKg(group),
        estimatedOneRepMaxKg: estimateOneRepMax(topWeightKg, repsAtTopWeight),
      }
    })
    .sort((a, b) => a.date.localeCompare(b.date))
}

/** Best single set ever recorded for an exercise, by estimated one-rep max. */
export function bestSet(sets: readonly LoggedSet[], exerciseId: string): LoggedSet | undefined {
  const candidates = sets.filter((s) => s.exerciseId === exerciseId)
  if (candidates.length === 0) return undefined

  return candidates.reduce((best, set) =>
    estimateOneRepMax(set.weightKg, set.reps) > estimateOneRepMax(best.weightKg, best.reps)
      ? set
      : best,
  )
}

export interface WeekSummary {
  /** ISO date of the Monday that starts this week. */
  readonly weekStart: string
  readonly sessionsCompleted: number
  readonly totalVolumeKg: number
  readonly setsPerMuscleGroup: Readonly<Record<string, number>>
  readonly totalSets: number
}

/**
 * The Monday of the week containing `date`, as an ISO date string.
 *
 * Weeks start Monday because the programme is prescribed as four sessions a
 * week; a Sunday boundary would split most people's week in the middle.
 */
export function weekStartOf(date: Date): string {
  const copy = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  // getUTCDay: 0 is Sunday, so Sunday needs to go back six days, not zero.
  const dayOffset = (copy.getUTCDay() + 6) % 7
  copy.setUTCDate(copy.getUTCDate() - dayOffset)
  return copy.toISOString().slice(0, 10)
}

/** Weekly rollups, most recent week first. */
export function weeklySummaries(
  logs: readonly SessionLog[],
  sets: readonly LoggedSet[],
  primaryMusclesFor: (exerciseId: string) => readonly string[],
): readonly WeekSummary[] {
  const setsByLog = new Map<string, LoggedSet[]>()
  for (const set of sets) {
    const list = setsByLog.get(set.sessionLogId) ?? []
    list.push(set)
    setsByLog.set(set.sessionLogId, list)
  }

  const weeks = new Map<string, { logs: SessionLog[]; sets: LoggedSet[] }>()
  for (const log of logs) {
    const week = weekStartOf(new Date(log.startedAt))
    const bucket = weeks.get(week) ?? { logs: [], sets: [] }
    bucket.logs.push(log)
    bucket.sets.push(...(setsByLog.get(log.id) ?? []))
    weeks.set(week, bucket)
  }

  return [...weeks.entries()]
    .map(([weekStart, bucket]) => {
      const counts: Record<string, number> = {}
      for (const set of bucket.sets) {
        for (const muscle of primaryMusclesFor(set.exerciseId)) {
          counts[muscle] = (counts[muscle] ?? 0) + 1
        }
      }
      return {
        weekStart,
        // Partial sessions are real training, but "sessions completed" means
        // completed - the weekly target is four finished sessions.
        sessionsCompleted: bucket.logs.filter((log) => log.completed).length,
        totalVolumeKg: totalVolumeKg(bucket.sets),
        setsPerMuscleGroup: counts,
        totalSets: bucket.sets.length,
      }
    })
    .sort((a, b) => b.weekStart.localeCompare(a.weekStart))
}
