import { onBeforeUnmount, onMounted } from 'vue'
import { useSessionStore } from '@/stores/session'

/** Display refresh rate. Correctness comes from timestamps, not this interval. */
const TICK_MS = 100

/**
 * Drives the session store's clock.
 *
 * Two jobs, both of which are DOM side effects and so belong here rather than
 * in the store: a display-rate interval, and a visibility listener that forces
 * an immediate catch-up when the tab comes back. Browsers throttle timers in
 * background tabs, so without the second one the countdown would appear frozen
 * for a moment after unhiding while the interval caught up on its own.
 */
export function useSessionRunner(): void {
  const session = useSessionStore()
  let timer: ReturnType<typeof setInterval> | undefined

  function onVisibilityChange(): void {
    if (document.visibilityState === 'visible') session.tick()
  }

  onMounted(() => {
    timer = setInterval(() => session.tick(), TICK_MS)
    document.addEventListener('visibilitychange', onVisibilityChange)
  })

  onBeforeUnmount(() => {
    if (timer !== undefined) clearInterval(timer)
    document.removeEventListener('visibilitychange', onVisibilityChange)
  })
}
