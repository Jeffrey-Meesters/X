/** Formatting helpers shared by the player, summary and history views. */

/** `875000` -> `"14:35"`. Hours are included only when non-zero. */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  const pad = (value: number): string => String(value).padStart(2, '0')
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`
}

/**
 * Countdown display. Rounds up so a segment shows "40" the instant it starts
 * and only shows "0" when it has genuinely finished — counting down from 39
 * feels broken.
 */
export function formatCountdown(remainingMs: number): string {
  return String(Math.max(0, Math.ceil(remainingMs / 1000)))
}

export function formatRepRange(range: readonly [number, number]): string {
  const [min, max] = range
  return min === max ? `${min}` : `${min}–${max}`
}
