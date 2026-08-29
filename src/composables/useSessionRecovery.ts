import { ref } from 'vue'
import {
  clearActiveSession,
  isResumable,
  readActiveSession,
  type ActiveSessionRecord,
} from '@/persistence/db'
import { useHistoryStore } from '@/stores/history'

/**
 * Cold-start recovery for an interrupted session (spec section 3.0.1).
 *
 * This is for cold starts only. A merely backgrounded tab is handled by the
 * visibility logic in the session runner, which catches up from the wall clock.
 */
export function useSessionRecovery() {
  const pending = ref<ActiveSessionRecord | undefined>()
  const checked = ref(false)

  async function check(now = Date.now()): Promise<void> {
    const history = useHistoryStore()
    await history.load()

    let record: ActiveSessionRecord | undefined
    try {
      record = await readActiveSession()
    } catch {
      // No IndexedDB: nothing to recover, and nothing worth failing over.
      checked.value = true
      return
    }

    if (!record) {
      checked.value = true
      return
    }

    if (isResumable(record, now)) {
      pending.value = record
    } else {
      // Older than the window: finalise automatically as a partial session,
      // keeping the sets that were logged, and do not offer a resume. Coming
      // back the next morning to a half-finished countdown helps nobody.
      await finaliseAsPartial(record)
    }

    checked.value = true
  }

  async function finaliseAsPartial(record: ActiveSessionRecord): Promise<void> {
    const history = useHistoryStore()
    await history.finishSessionLog(record.sessionLogId, {
      completed: false,
      endedAt: new Date(record.savedAt).toISOString(),
      workingTimeMs: record.workingTimeMs,
      totalElapsedMs: record.totalElapsedMs,
    })
    await clearActiveSession().catch(() => {})
    pending.value = undefined
  }

  async function discard(): Promise<void> {
    const record = pending.value
    if (record) await finaliseAsPartial(record)
  }

  function accept(): void {
    pending.value = undefined
  }

  return { pending, checked, check, discard, accept }
}
