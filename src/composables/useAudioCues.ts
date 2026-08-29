import { onBeforeUnmount } from 'vue'
import { createAudioCuePlayer, cueForEvent, type AudioCuePlayer } from '@/engine/audio'
import { useSessionStore } from '@/stores/session'
import { useSettingsStore } from '@/stores/settings'

/**
 * One AudioContext for the app.
 *
 * Module-scoped because the context has to be created during the tap on Start,
 * which happens on the home screen, but is used by the player on the next
 * route. A per-component instance would be created after navigation - outside
 * any gesture - and would stay suspended on iOS.
 */
let player: AudioCuePlayer | undefined

function getPlayer(): AudioCuePlayer {
  player ??= createAudioCuePlayer()
  return player
}

/** Call from the user gesture that begins a session. */
export async function unlockAudio(): Promise<void> {
  await getPlayer().unlock()
}

/** Test seam: swap in a player with an injected context. */
export function setAudioPlayerForTests(next: AudioCuePlayer | undefined): void {
  player = next
}

export function useAudioCues(): void {
  const session = useSessionStore()
  const settingsStore = useSettingsStore()

  const stop = session.onEvent((event) => {
    // Returning to a hidden tab must not replay the beeps for intervals that
    // already went by (spec section 6.3). This is what the flag is for.
    if (event.missed) return
    if (!settingsStore.settings.audioCues) return

    const segment = session.segments[event.segmentIndex]
    const cue = cueForEvent(event.kind, segment?.type)
    if (cue) getPlayer().play(cue)
  })

  onBeforeUnmount(stop)
}
