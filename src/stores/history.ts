import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { LoggedSet, SessionLog } from '@/types/models'
import { readAllSessionLogs, readAllSets, writeSessionLog, writeSet } from '@/persistence/db'

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
  const sessionLogs = ref<SessionLog[]>([])
  const sets = ref<LoggedSet[]>([])

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
      const [logs, allSets] = await Promise.all([readAllSessionLogs(), readAllSets()])
      sessionLogs.value = logs
      sets.value = allSets
    } catch (error) {
      // A blocked or unavailable IndexedDB must not stop the user training.
      // They lose history, not the session in front of them.
      warn('load history', error)
    }
    loaded.value = true
  }

  async function startSessionLog(log: SessionLog): Promise<void> {
    sessionLogs.value = [...sessionLogs.value, log]
    await persistLog(log)
  }

  async function addSet(set: LoggedSet): Promise<void> {
    sets.value = [...sets.value, set]
    const owner = sessionLogs.value.find((log) => log.id === set.sessionLogId)
    const updated = owner ? { ...owner, sets: [...owner.sets, set.id] } : undefined
    if (updated) {
      sessionLogs.value = sessionLogs.value.map((log) => (log.id === updated.id ? updated : log))
    }

    try {
      await writeSet(set)
      if (updated) await writeSessionLog(updated)
    } catch (error) {
      // Kept in memory regardless, so the session summary is still correct.
      warn('persist set', error)
    }
  }

  async function finishSessionLog(
    id: string,
    patch: { completed: boolean; endedAt: string; workingTimeMs: number; totalElapsedMs: number },
  ): Promise<void> {
    const updated = sessionLogs.value.find((log) => log.id === id)
    if (!updated) return
    const next = { ...updated, ...patch }
    sessionLogs.value = sessionLogs.value.map((log) => (log.id === id ? next : log))
    await persistLog(next)
  }

  async function persistLog(log: SessionLog): Promise<void> {
    try {
      await writeSessionLog(log)
    } catch (error) {
      // See above: history is best-effort, the workout is not.
      warn('persist session log', error)
    }
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

  /** Clears the in-memory mirror only. Used by tests and by import. */
  function reset(): void {
    sessionLogs.value = []
    sets.value = []
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
    reset,
  }
})
