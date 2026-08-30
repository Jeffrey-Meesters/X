import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { LoggedSet, SessionLog } from '@/types/models'
import {
  clearProgressionTarget,
  readAllSessionLogs,
  readAllSets,
  readProgressionTargets,
  writeProgressionTarget,
  writeSessionLog,
  writeSet,
  type ProgressionTarget,
} from '@/persistence/db'

/**
 * Session logs and per-exercise set history, backed by IndexedDB.
 *
 * Reads are served from an in-memory mirror loaded once at boot, so the
 * pre-fill lookup during a rest is synchronous and cannot make the player wait.
 * Writes go to both, and are fire-and-forget: a failed write must never take
 * the session down mid-workout.
 */
/**
 * Persistence here is best-effort by design, but a silent catch hides real
 * bugs - a DataCloneError from reactive state looks identical to a browser
 * with storage disabled. Failures stay non-fatal, but they are never quiet.
 */
function warn(action: string, error: unknown): void {
  console.warn(`[history] could not ${action}:`, error)
}

export const useHistoryStore = defineStore('history', () => {
  /**
   * Writes are serialised, and each one re-reads the record it is about to
   * write from memory rather than capturing it when it was queued.
   *
   * Both halves matter, and the bug they fix is not hypothetical: the final
   * tick of a session commits the last set *and* closes the log. Queued with a
   * captured copy, the set's write - which still says `completed: false` -
   * lands after the completion write and silently reverts it, recording every
   * finished session as a partial one.
   */
  let queue: Promise<void> = Promise.resolve()

  function enqueue(action: string, task: () => Promise<void>): Promise<void> {
    queue = queue.then(task).catch((error) => {
      // Non-fatal by design - a workout must not stop because a write did -
      // but never silent: a bare catch hides exactly this kind of bug.
      warn(action, error)
    })
    return queue
  }

  const sessionLogs = ref<SessionLog[]>([])
  const sets = ref<LoggedSet[]>([])
  /** Weights accepted from progression nudges, keyed by exercise. */
  const targets = ref<ProgressionTarget[]>([])

  const completedSessionCount = computed(
    () => sessionLogs.value.filter((log) => log.completed).length,
  )

  /** Newest first. */
  const orderedLogs = computed(() =>
    [...sessionLogs.value].sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
  )

  const loaded = ref(false)

  /** Hydrates the in-memory mirror. Safe to call more than once. */
  async function load(): Promise<void> {
    if (loaded.value) return
    try {
      const [logs, allSets, storedTargets] = await Promise.all([
        readAllSessionLogs(),
        readAllSets(),
        readProgressionTargets(),
      ])
      sessionLogs.value = logs
      sets.value = allSets
      targets.value = storedTargets
    } catch (error) {
      // A blocked or unavailable IndexedDB must not stop the user training.
      // They lose history, not the session in front of them.
      warn('load history', error)
    }
    loaded.value = true
  }

  async function startSessionLog(log: SessionLog): Promise<void> {
    sessionLogs.value = [...sessionLogs.value, log]
    await persistLog(log.id)
  }

  async function addSet(set: LoggedSet): Promise<void> {
    sets.value = [...sets.value, set]
    const owner = sessionLogs.value.find((log) => log.id === set.sessionLogId)
    if (owner) {
      const updated = { ...owner, sets: [...owner.sets, set.id] }
      sessionLogs.value = sessionLogs.value.map((log) => (log.id === updated.id ? updated : log))
    }

    // Kept in memory regardless of what storage does, so the session summary
    // is still correct on a device that cannot write.
    enqueue('persist set', () => writeSet(set))
    await persistLog(set.sessionLogId)
  }

  async function finishSessionLog(
    id: string,
    patch: { completed: boolean; endedAt: string; workingTimeMs: number; totalElapsedMs: number },
  ): Promise<void> {
    const updated = sessionLogs.value.find((log) => log.id === id)
    if (!updated) return
    const next = { ...updated, ...patch }
    sessionLogs.value = sessionLogs.value.map((log) => (log.id === id ? next : log))
    await persistLog(id)
  }

  /**
   * Queues a write of whatever this log says *at the time the write runs*.
   *
   * Taking the id rather than the record is the whole point: a queued write
   * holding a snapshot from when it was scheduled will happily undo a later
   * change that has already been applied in memory.
   */
  function persistLog(id: string): Promise<void> {
    return enqueue('persist session log', async () => {
      const log = sessionLogs.value.find((entry) => entry.id === id)
      if (log) await writeSessionLog(log)
    })
  }

  function setsForLog(logId: string): LoggedSet[] {
    return sets.value.filter((set) => set.sessionLogId === logId)
  }

  /**
   * Sets for this exercise from the most recent session that contains it.
   *
   * Scoped to a single session rather than "the last N sets" so that the
   * pre-fill reflects one coherent session's working weight.
   */
  function lastSessionSetsFor(exerciseId: string, excludeLogId?: string): LoggedSet[] {
    for (const log of orderedLogs.value) {
      if (log.id === excludeLogId) continue
      const matching = sets.value.filter(
        (set) => set.sessionLogId === log.id && set.exerciseId === exerciseId,
      )
      if (matching.length > 0) return matching
    }
    return []
  }

  /** True when the user has never logged this exercise before. */
  function isFirstTimeFor(exerciseId: string, excludeLogId?: string): boolean {
    return lastSessionSetsFor(exerciseId, excludeLogId).length === 0
  }

  /**
   * Records a weight the user accepted from a progression nudge, so the next
   * session's entry opens on it.
   */
  async function acceptProgression(exerciseId: string, weightKg: number): Promise<void> {
    const target: ProgressionTarget = {
      exerciseId,
      weightKg,
      acceptedAt: new Date().toISOString(),
    }
    targets.value = [...targets.value.filter((t) => t.exerciseId !== exerciseId), target]

    try {
      await writeProgressionTarget(target)
    } catch (error) {
      warn('persist progression target', error)
    }
  }

  /** Drops an accepted target once it has been used, or when declined. */
  async function clearTarget(exerciseId: string): Promise<void> {
    targets.value = targets.value.filter((t) => t.exerciseId !== exerciseId)
    try {
      await clearProgressionTarget(exerciseId)
    } catch (error) {
      warn('clear progression target', error)
    }
  }

  /**
   * The weight an accepted nudge set for this exercise, if it is still ahead of
   * what has actually been lifted since.
   *
   * Guarding on the timestamp matters: a target accepted three sessions ago and
   * never acted on should not keep overriding a pre-fill the user has since
   * moved past by hand.
   */
  function targetFor(exerciseId: string): number | undefined {
    const target = targets.value.find((t) => t.exerciseId === exerciseId)
    if (!target) return undefined

    const liftedSince = sets.value.some(
      (set) => set.exerciseId === exerciseId && set.completedAt > target.acceptedAt,
    )
    return liftedSince ? undefined : target.weightKg
  }

  /** Clears the in-memory mirror only. Used by tests and by import. */
  function reset(): void {
    sessionLogs.value = []
    sets.value = []
    targets.value = []
    loaded.value = false
  }

  return {
    sessionLogs,
    sets,
    loaded,
    completedSessionCount,
    orderedLogs,
    load,
    startSessionLog,
    addSet,
    finishSessionLog,
    setsForLog,
    lastSessionSetsFor,
    isFirstTimeFor,
    targets,
    acceptProgression,
    clearTarget,
    targetFor,
    reset,
  }
})
