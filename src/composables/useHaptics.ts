import { onBeforeUnmount } from 'vue'
import { useSessionStore } from '@/stores/session'
import { useSettingsStore } from '@/stores/settings'

/** Pattern per cue, in the alternating on/off form `navigator.vibrate` wants. */
const PATTERNS: Readonly<Record<string, number | number[]>> = {
  'work-start': [0, 120],
  'work-end': [0, 60],
  halfway: [0, 60, 80, 60],
  complete: [0, 120, 100, 120, 100, 240],
}

/**
 * Haptic pulses at interval changes (spec section 7).
 *
 * Useful precisely when audio is not: a noisy gym, or headphones playing
 * something else.
 */
export function useHaptics(): void {
  const session = useSessionStore()
  const settingsStore = useSettingsStore()

  const supported = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'

  const stop = session.onEvent((event) => {
    if (event.missed || !supported) return
    if (!settingsStore.settings.haptics) return

    const segment = session.segments[event.segmentIndex]
    let pattern: number | number[] | undefined

    if (event.kind === 'halfway') pattern = PATTERNS.halfway
    else if (event.kind === 'complete') pattern = PATTERNS.complete
    else if (event.kind === 'segment-start') {
      pattern = segment?.type === 'transition' ? PATTERNS['work-end'] : PATTERNS['work-start']
    }

    if (!pattern) return
    try {
      navigator.vibrate(pattern)
    } catch {
      // Unsupported or blocked. Nothing else depends on it.
    }
  })

  onBeforeUnmount(stop)
}
