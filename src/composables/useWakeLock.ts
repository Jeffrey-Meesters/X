import { onBeforeUnmount, onMounted, watch } from 'vue'
import { useSessionStore } from '@/stores/session'
import { useSettingsStore } from '@/stores/settings'

/**
 * Keeps the screen on during a session (spec section 6.4).
 *
 * A graceful no-op where unsupported, and re-acquired after the page becomes
 * visible again: the browser releases the lock whenever the tab is hidden, so
 * without re-acquiring, one glance at a notification would let the screen sleep
 * for the rest of the workout.
 */
export function useWakeLock(): void {
  const session = useSessionStore()
  const settingsStore = useSettingsStore()

  let sentinel: WakeLockSentinel | undefined

  const supported = typeof navigator !== 'undefined' && 'wakeLock' in navigator

  async function acquire(): Promise<void> {
    if (!supported || sentinel || !settingsStore.settings.keepScreenAwake) return
    try {
      sentinel = await navigator.wakeLock.request('screen')
      // The browser can drop it on its own; forget the stale handle so a later
      // re-acquire is not skipped by the guard above.
      sentinel.addEventListener('release', () => {
        sentinel = undefined
      })
    } catch {
      // Denied, or the document was not visible. Not worth surfacing.
    }
  }

  async function release(): Promise<void> {
    try {
      await sentinel?.release()
    } catch {
      // Already gone.
    }
    sentinel = undefined
  }

  function onVisibilityChange(): void {
    if (document.visibilityState === 'visible' && session.isActive) void acquire()
  }

  onMounted(() => {
    void acquire()
    document.addEventListener('visibilitychange', onVisibilityChange)
  })

  // No reason to hold the screen awake on a finished session.
  watch(
    () => session.isComplete,
    (complete) => {
      if (complete) void release()
    },
  )

  watch(
    () => settingsStore.settings.keepScreenAwake,
    (enabled) => {
      if (enabled) void acquire()
      else void release()
    },
  )

  onBeforeUnmount(() => {
    document.removeEventListener('visibilitychange', onVisibilityChange)
    void release()
  })
}
