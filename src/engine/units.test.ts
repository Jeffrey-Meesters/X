import { describe, it, expect } from 'vitest'
import {
  lbToKg,
  toDisplay,
  fromDisplay,
  formatWeight,
  formatWeightWithUnit,
  stepWeight,
  calibrationFloor,
  totalVolumeKg,
  estimateOneRepMax,
} from './units'

describe('conversion', () => {
  it('round-trips kilograms unchanged', () => {
    expect(fromDisplay(toDisplay(22.5, 'kg'), 'kg')).toBe(22.5)
  })

  it('round-trips pounds without drifting', () => {
    for (const lb of [10, 15, 25, 45, 95, 135]) {
      expect(toDisplay(lbToKg(lb), 'lb')).toBeCloseTo(lb, 6)
    }
  })
})

describe('stepper arithmetic', () => {
  it('steps up and down in kilograms', () => {
    expect(stepWeight(20, 2.5, 1, 'kg')).toBe(22.5)
    expect(stepWeight(22.5, 2.5, -1, 'kg')).toBe(20)
  })

  it('does not accumulate drift across many pound taps', () => {
    // The bug this guards: converting a 5 lb increment to kilograms and adding
    // it repeatedly leaves a user at 47.4 lb when they expect 50.
    let weightKg = lbToKg(10)
    for (let i = 0; i < 8; i += 1) weightKg = stepWeight(weightKg, 5, 1, 'lb')

    expect(toDisplay(weightKg, 'lb')).toBeCloseTo(50, 6)
    expect(formatWeight(weightKg, 'lb')).toBe('50')
  })

  it('returns to exactly where it started after up then down', () => {
    let weightKg = lbToKg(25)
    for (let i = 0; i < 20; i += 1) weightKg = stepWeight(weightKg, 5, 1, 'lb')
    for (let i = 0; i < 20; i += 1) weightKg = stepWeight(weightKg, 5, -1, 'lb')

    expect(toDisplay(weightKg, 'lb')).toBeCloseTo(25, 6)
  })

  it('snaps an off-grid value onto the increment grid', () => {
    // 21 kg with a 2.5 kg increment snaps to 20, then steps to 22.5.
    expect(stepWeight(21, 2.5, 1, 'kg')).toBe(22.5)
  })

  it('never goes below zero', () => {
    expect(stepWeight(2.5, 2.5, -1, 'kg')).toBe(0)
    expect(stepWeight(0, 2.5, -1, 'kg')).toBe(0)
  })

  it('honours a 5 kg increment', () => {
    expect(stepWeight(20, 5, 1, 'kg')).toBe(25)
  })
})

describe('formatting', () => {
  it('drops a trailing zero but keeps a real half', () => {
    expect(formatWeight(20, 'kg')).toBe('20')
    expect(formatWeight(22.5, 'kg')).toBe('22.5')
  })

  it('includes the unit when asked', () => {
    expect(formatWeightWithUnit(20, 'kg')).toBe('20 kg')
    expect(formatWeightWithUnit(lbToKg(45), 'lb')).toBe('45 lb')
  })
})

describe('calibration floor', () => {
  it('starts low and deliberately, in either unit', () => {
    expect(calibrationFloor('kg')).toBe(5)
    expect(formatWeight(calibrationFloor('lb'), 'lb')).toBe('10')
  })
})

describe('volume and estimates', () => {
  it('sums weight times reps', () => {
    expect(
      totalVolumeKg([
        { weightKg: 20, reps: 10 },
        { weightKg: 22.5, reps: 8 },
      ]),
    ).toBe(380)
  })

  it('is zero for no sets', () => {
    expect(totalVolumeKg([])).toBe(0)
  })

  it('estimates a one-rep max, returning the weight itself at one rep', () => {
    expect(estimateOneRepMax(100, 1)).toBe(100)
    expect(estimateOneRepMax(100, 10)).toBeCloseTo(133.33, 1)
    expect(estimateOneRepMax(100, 0)).toBe(0)
  })
})
