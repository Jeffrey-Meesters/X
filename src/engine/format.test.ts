import { describe, it, expect } from 'vitest'
import { formatDuration, formatCountdown, formatRepRange } from './format'

describe('formatDuration', () => {
  it('formats the nominal session length', () => {
    expect(formatDuration((90 + 720 + 60) * 1000)).toBe('14:30')
  })

  it('pads seconds', () => {
    expect(formatDuration(65_000)).toBe('1:05')
    expect(formatDuration(600_000)).toBe('10:00')
  })

  it('adds hours only when needed', () => {
    expect(formatDuration(3_600_000)).toBe('1:00:00')
    expect(formatDuration(3_661_000)).toBe('1:01:01')
  })

  it('clamps negatives to zero', () => {
    expect(formatDuration(-5000)).toBe('0:00')
  })
})

describe('formatCountdown', () => {
  it('shows the full duration the instant a segment starts', () => {
    // Rounding down here would display "39" for a 40s work interval.
    expect(formatCountdown(40_000)).toBe('40')
    expect(formatCountdown(39_999)).toBe('40')
  })

  it('only reaches zero when the segment is genuinely done', () => {
    expect(formatCountdown(1)).toBe('1')
    expect(formatCountdown(0)).toBe('0')
    expect(formatCountdown(-100)).toBe('0')
  })
})

describe('formatRepRange', () => {
  it('renders a range with an en dash', () => {
    expect(formatRepRange([8, 12])).toBe('8–12')
  })

  it('collapses a single-value range', () => {
    expect(formatRepRange([1, 1])).toBe('1')
  })
})
