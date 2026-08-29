import { onBeforeUnmount, watch } from 'vue'
import { useSessionStore } from '@/stores/session'
import { useSettingsStore } from '@/stores/settings'
import { getExercise } from '@/data/exercises'

/**
 * Spoken "next up" announcements during a rest (spec section 7).
 *
 * The engine decides when: it emits `announce-next` roughly five seconds before
 * a rest ends, which is long enough to finish speaking before the work tone.
 */
export function useVoice(): void {
  const session = useSessionStore()
  const settingsStore = useSettingsStore()

  const synth = typeof window === 'undefined' ? undefined : window.speechSynthesis

  function speak(text: string): void {
    if (!synth) return
    try {
      // Never queue: a backlog would still be talking over the next interval.
      synth.cancel()
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.rate = 1.05
      synth.speak(utterance)
    } catch {
      // Speech is an enhancement; losing it must not affect the session.
    }
  }

  const stop = session.onEvent((event) => {
    if (event.missed) return
    if (!settingsStore.settings.voiceAnnouncements) return
    if (event.kind !== 'announce-next') return

    const next = session.nextExercise
    if (next) speak(`Next up, ${next.name}`)
  })

  // Announce the side switch too: it is the one cue where knowing *what* to do
  // matters, and a tone alone cannot say it.
  const stopHalfway = session.onEvent((event) => {
    if (event.missed || !settingsStore.settings.voiceAnnouncements) return
    if (event.kind !== 'halfway') return

    const segment = session.segments[event.segmentIndex]
    if (segment && getExercise(segment.exerciseId).unilateral) speak('Switch sides')
  })

  // Pausing suspends the cues, so anything mid-sentence stops with them.
  const stopPauseWatch = watch(
    () => session.isPaused,
    (paused) => {
      if (paused) synth?.cancel()
    },
  )

  onBeforeUnmount(() => {
    stop()
    stopHalfway()
    stopPauseWatch()
    synth?.cancel()
  })
}
