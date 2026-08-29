import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { LoggedSet, SessionLog } from '@/types/models'

/**
 * Session logs and per-exercise set history.
 *
 * The backing store is in memory for now and becomes IndexedDB in the
 * persistence milestone. Every method is already async so that swap is an
 * implementation change rather than a rewrite of every call site.
 */
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

  async function load(): Promise<void> {
    // No-op until IndexedDB backs this.
  }

  async function startSessionLog(log: SessionLog): Promise<void> {
    sessionLogs.value = [...sessionLogs.value, log]
  }

  async function addSet(set: LoggedSet): Promise<void> {
    sets.value = [...sets.value, set]
    sessionLogs.value = sessionLogs.value.map((log) =>
      log.id === set.sessionLogId ? { ...log, sets: [...log.sets, set.id] } : log,
    )
  }

  async function finishSessionLog(
    id: string,
    patch: { completed: boolean; endedAt: string; workingTimeMs: number; totalElapsedMs: number },
  ): Promise<void> {
    sessionLogs.value = sessionLogs.value.map((log) => (log.id === id ? { ...log, ...patch } : log))
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

  function reset(): void {
    sessionLogs.value = []
    sets.value = []
  }

  return {
    sessionLogs,
    sets,
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
