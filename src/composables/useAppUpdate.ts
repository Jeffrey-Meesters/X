import { useRegisterSW } from 'virtual:pwa-register/vue'

/**
 * Service worker registration, and the "a new version is ready" signal.
 *
 * Registered once for the whole app rather than per component: calling
 * `useRegisterSW` twice would register two Workbox instances against the same
 * worker and fire the prompt twice.
 */
let registration: ReturnType<typeof useRegisterSW> | undefined

export function useAppUpdate(): ReturnType<typeof useRegisterSW> {
  registration ??= useRegisterSW({
    immediate: true,
    onRegisterError(error: unknown) {
      // Not fatal, and not rare: a browser with service workers disabled, or a
      // page served over plain http. The app still runs, it just will not be
      // installable or work offline.
      console.warn('[pwa] service worker registration failed:', error)
    },
  })
  return registration
}

/** Test seam: drops the cached registration between test cases. */
export function resetAppUpdateForTests(): void {
  registration = undefined
}
