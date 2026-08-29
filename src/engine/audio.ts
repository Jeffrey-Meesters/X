/**
 * Generated audio cues.
 *
 * Tones are synthesised with the Web Audio API rather than shipped as files:
 * no assets to cache, nothing to fetch offline, and a few hundred bytes of code
 * instead of a few hundred kilobytes of samples (spec section 7).
 *
 * Plain TypeScript with an injectable context factory, so the cue table and the
 * scheduling are testable without a real audio device.
 */

export type CueName = 'countdown' | 'work-start' | 'work-end' | 'halfway' | 'complete'

interface Note {
  readonly freq: number
  /** Offset from the start of the cue. */
  readonly atMs: number
  readonly durationMs: number
  readonly gain?: number
  readonly type?: OscillatorType
}

/**
 * Each cue has to be identifiable without looking at the phone, so they differ
 * in pitch, length and shape rather than only in volume.
 */
export const CUES: Readonly<Record<CueName, readonly Note[]>> = {
  // Tick. Short, unobtrusive, three of them in a row before the first movement.
  countdown: [{ freq: 660, atMs: 0, durationMs: 110 }],
  // Go. Higher and longer than the countdown ticks it follows.
  'work-start': [{ freq: 880, atMs: 0, durationMs: 260, gain: 0.32 }],
  // Stop. Lower than work-start, so the two never get confused mid-set.
  'work-end': [{ freq: 440, atMs: 0, durationMs: 260, gain: 0.32 }],
  // Switch sides. A double blip, deliberately unlike any single-tone cue.
  halfway: [
    { freq: 990, atMs: 0, durationMs: 90 },
    { freq: 990, atMs: 140, durationMs: 90 },
  ],
  // Done. A rising third, the only cue that resolves upward.
  complete: [
    { freq: 523.25, atMs: 0, durationMs: 160 },
    { freq: 659.25, atMs: 170, durationMs: 160 },
    { freq: 783.99, atMs: 340, durationMs: 320 },
  ],
}

const DEFAULT_GAIN = 0.25
/** Ramp lengths that keep a tone from clicking at either end. */
const ATTACK_S = 0.008
const RELEASE_S = 0.03

export interface AudioCuePlayer {
  /** Must be called from a user gesture. Safe to call repeatedly. */
  unlock(): Promise<void>
  play(cue: CueName): void
  dispose(): void
  readonly unlocked: boolean
  readonly available: boolean
}

export interface AudioCuePlayerOptions {
  /** Injected by tests. Returns undefined where Web Audio is unavailable. */
  readonly createContext?: () => AudioContext | undefined
}

function defaultCreateContext(): AudioContext | undefined {
  const Ctor =
    typeof window === 'undefined'
      ? undefined
      : (window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
  return Ctor ? new Ctor() : undefined
}

export function createAudioCuePlayer(options: AudioCuePlayerOptions = {}): AudioCuePlayer {
  const createContext = options.createContext ?? defaultCreateContext

  let context: AudioContext | undefined
  let unlocked = false
  let available = true

  async function unlock(): Promise<void> {
    if (unlocked) return
    try {
      // Created here, inside the gesture, rather than at page load: a context
      // constructed outside one starts suspended and stays that way on iOS.
      context ??= createContext()
      if (!context) {
        available = false
        return
      }
      if (context.state === 'suspended') await context.resume()
      unlocked = true
    } catch {
      available = false
    }
  }

  function play(cue: CueName): void {
    if (!context || !unlocked) return
    try {
      const now = context.currentTime
      for (const note of CUES[cue]) {
        const oscillator = context.createOscillator()
        const gainNode = context.createGain()

        oscillator.type = note.type ?? 'sine'
        oscillator.frequency.value = note.freq

        const start = now + note.atMs / 1000
        const end = start + note.durationMs / 1000
        const peak = note.gain ?? DEFAULT_GAIN

        // A square-edged gain change pops; ramping in and out does not.
        gainNode.gain.setValueAtTime(0, start)
        gainNode.gain.linearRampToValueAtTime(peak, start + ATTACK_S)
        gainNode.gain.setValueAtTime(peak, Math.max(start + ATTACK_S, end - RELEASE_S))
        gainNode.gain.linearRampToValueAtTime(0, end)

        oscillator.connect(gainNode)
        gainNode.connect(context.destination)
        oscillator.start(start)
        oscillator.stop(end + 0.01)
      }
    } catch {
      // A cue failing is never worth interrupting a workout for.
    }
  }

  function dispose(): void {
    try {
      void context?.close()
    } catch {
      // Already closed, or never opened.
    }
    context = undefined
    unlocked = false
  }

  return {
    unlock,
    play,
    dispose,
    get unlocked() {
      return unlocked
    },
    get available() {
      return available
    },
  }
}

/**
 * Maps a timer event to the cue it should make, or undefined for silence.
 *
 * Kept separate from the player so the mapping is testable on its own, and so
 * the rule about missed cues lives in one place.
 */
export function cueForEvent(
  kind: string,
  segmentType: string | undefined,
): CueName | undefined {
  switch (kind) {
    case 'countdown':
      return 'countdown'
    case 'halfway':
      return 'halfway'
    case 'complete':
      return 'complete'
    case 'segment-start':
      // Warm-ups and finishers are work too: anything that is not a rest gets
      // the go tone, so the user never has to look to know an interval started.
      return segmentType === 'transition' ? 'work-end' : 'work-start'
    default:
      return undefined
  }
}
