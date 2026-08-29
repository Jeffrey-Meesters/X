import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useSessionStore } from './session'
import { useSettingsStore } from './settings'
import { useHistoryStore } from './history'
import type { TimerEvent } from '@/engine/timer'

function fakeClock(start = 1_700_000_000_000) {
  let now = start
  return {
    now: () => now,
    advance(ms: number) {
      now += ms
    },
  }
}

/** Runs the store forward by ticking the way the runner composable would. */
function run(clock: ReturnType<typeof fakeClock>, store: ReturnType<typeof useSessionStore>, ms: number) {
  clock.advance(ms)
  store.tick()
}

describe('session store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('starts a session on the first segment', () => {
    const clock = fakeClock()
    const store = useSessionStore()
    useSettingsStore().update({ leadIn: false })

    store.start('session-a', { clock: clock.now })

    expect(store.status).toBe('running')
    expect(store.currentExercise?.id).toBe('bodyweight-squat')
    expect(store.snapshot?.remainingMs).toBe(30_000)
  })

  it('includes the lead-in when the setting is on', () => {
    const clock = fakeClock()
    const store = useSessionStore()
    useSettingsStore().update({ leadIn: true })

    store.start('session-a', { clock: clock.now })
    expect(store.currentSegment?.type).toBe('lead-in')
  })

  it('applies no-bench substitutions when the user has no bench', () => {
    const clock = fakeClock()
    const store = useSessionStore()
    useSettingsStore().update({ hasBench: false, leadIn: false })

    store.start('session-a', { clock: clock.now })
    const ids = store.segments.map((segment) => segment.exerciseId)

    expect(ids).toContain('db-floor-press')
    expect(ids).not.toContain('db-bench-press')
  })

  it('keeps the bench movements when the user has one', () => {
    const clock = fakeClock()
    const store = useSessionStore()
    useSettingsStore().update({ hasBench: true, leadIn: false })

    store.start('session-a', { clock: clock.now })
    expect(store.segments.map((s) => s.exerciseId)).toContain('db-bench-press')
  })

  it('advances through segments as the clock moves', () => {
    const clock = fakeClock()
    const store = useSessionStore()
    useSettingsStore().update({ leadIn: false })
    store.start('session-a', { clock: clock.now })

    run(clock, store, 90_000) // the whole warm-up
    expect(store.currentSegment?.type).toBe('work')
    expect(store.currentExercise?.id).toBe('goblet-squat')
  })

  it('previews the next exercise during a rest', () => {
    const clock = fakeClock()
    const store = useSessionStore()
    useSettingsStore().update({ leadIn: false })
    store.start('session-a', { clock: clock.now })

    run(clock, store, 130_000) // warm-up + first work interval
    expect(store.currentSegment?.type).toBe('transition')
    expect(store.nextExercise?.id).toBe('db-bench-press')
  })

  it('toggles pause and resume', () => {
    const clock = fakeClock()
    const store = useSessionStore()
    useSettingsStore().update({ leadIn: false })
    store.start('session-a', { clock: clock.now })

    run(clock, store, 10_000)
    store.togglePause()
    expect(store.isPaused).toBe(true)

    clock.advance(300_000)
    store.tick()
    expect(store.snapshot?.remainingMs).toBe(20_000)

    store.togglePause()
    expect(store.isRunning).toBe(true)
    expect(store.snapshot?.remainingMs).toBe(20_000)
  })

  it('reports progress across the session', () => {
    const clock = fakeClock()
    const store = useSessionStore()
    useSettingsStore().update({ leadIn: false })
    store.start('session-a', { clock: clock.now })

    expect(store.progress).toBe(0)
    run(clock, store, 435_000) // half of 14:30
    expect(store.progress).toBeCloseTo(0.5, 2)
  })

  it('forwards timer events to subscribers', () => {
    const clock = fakeClock()
    const store = useSessionStore()
    useSettingsStore().update({ leadIn: false })

    const seen: TimerEvent[] = []
    const off = store.onEvent((event) => seen.push(event))

    store.start('session-a', { clock: clock.now })
    expect(seen.map((e) => e.kind)).toContain('segment-start')

    run(clock, store, 30_000)
    expect(seen.filter((e) => e.kind === 'segment-end')).toHaveLength(1)

    off()
    run(clock, store, 30_000)
    expect(seen.filter((e) => e.kind === 'segment-end')).toHaveLength(1)
  })

  it('extends a rest without touching later segments', () => {
    const clock = fakeClock()
    const store = useSessionStore()
    useSettingsStore().update({ leadIn: false })
    store.start('session-a', { clock: clock.now })

    run(clock, store, 130_000)
    const before = store.snapshot!.totalRemainingMs
    store.extend(15_000)

    expect(store.snapshot!.remainingMs).toBe(35_000)
    expect(store.snapshot!.totalRemainingMs).toBe(before + 15_000)
  })

  it('ends early and keeps what was completed', () => {
    const clock = fakeClock()
    const store = useSessionStore()
    useSettingsStore().update({ leadIn: false })
    store.start('session-a', { clock: clock.now })

    run(clock, store, 200_000)
    store.end()

    expect(store.isComplete).toBe(true)
    expect(store.snapshot?.totalElapsedMs).toBe(200_000)
  })

  it('completes a whole session', () => {
    const clock = fakeClock()
    const store = useSessionStore()
    useSettingsStore().update({ leadIn: false })
    store.start('session-a', { clock: clock.now })

    run(clock, store, 870_000)
    expect(store.isComplete).toBe(true)
    expect(store.snapshot?.workingTimeMs).toBe(870_000)
  })

  it('clears itself on reset', () => {
    const clock = fakeClock()
    const store = useSessionStore()
    store.start('session-a', { clock: clock.now })
    store.reset()

    expect(store.status).toBe('idle')
    expect(store.segments).toHaveLength(0)
    expect(store.currentSegment).toBeUndefined()
  })
})

describe('settings store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('starts from the documented defaults', () => {
    const store = useSettingsStore()
    expect(store.settings.units).toBe('kg')
    expect(store.settings.weightIncrement).toBe(2.5)
    expect(store.settings.showRir).toBe(false)
  })

  it('persists updates to localStorage', async () => {
    const store = useSettingsStore()
    store.update({ units: 'lb', weightIncrement: 5 })
    await new Promise((resolve) => setTimeout(resolve, 0))

    const raw = localStorage.getItem('fullbody15.settings')
    expect(raw).toBeTruthy()
    expect(JSON.parse(raw!).units).toBe('lb')
  })

  it('merges stored settings over defaults so new keys are never undefined', () => {
    localStorage.setItem('fullbody15.settings', JSON.stringify({ units: 'lb' }))
    setActivePinia(createPinia())

    const store = useSettingsStore()
    expect(store.settings.units).toBe('lb')
    expect(store.settings.haptics).toBe(true)
  })

  it('falls back to defaults on corrupt storage', () => {
    localStorage.setItem('fullbody15.settings', 'not json')
    setActivePinia(createPinia())

    expect(useSettingsStore().settings.units).toBe('kg')
  })
})

describe('set logging', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  /** Runs to the first rest, where the first weight entry opens. */
  function toFirstRest() {
    const clock = fakeClock()
    const store = useSessionStore()
    useSettingsStore().update({ leadIn: false })
    store.start('session-a', { clock: clock.now })
    run(clock, store, 130_000) // 90s warm-up + the 40s work interval
    return { clock, store }
  }

  it('opens a weight entry when the rest begins', () => {
    const { store } = toFirstRest()
    expect(store.currentSegment?.type).toBe('transition')
    expect(store.draft?.exerciseId).toBe('goblet-squat')
    expect(store.draft?.round).toBe(1)
  })

  it('starts at the calibration floor with no history', () => {
    const { store } = toFirstRest()
    expect(store.draft?.weightKg).toBe(5)
    expect(store.draft?.isCalibration).toBe(true)
  })

  it('defaults reps to the top of the target range', () => {
    const { store } = toFirstRest()
    expect(store.draft?.reps).toBe(12)
  })

  it('steps the weight and marks it touched', () => {
    const { store } = toFirstRest()
    store.adjustWeight(1)
    expect(store.draft?.weightKg).toBe(7.5)
    expect(store.draft?.touched).toBe(true)
  })

  it('accepts a typed weight from the keypad fallback', () => {
    const { store } = toFirstRest()
    store.setWeightFromDisplay(24)
    expect(store.draft?.weightKg).toBe(24)
    expect(store.draft?.touched).toBe(true)
  })

  it('auto-commits when the rest countdown reaches zero', () => {
    const { clock, store } = toFirstRest()
    store.adjustWeight(1)

    run(clock, store, 20_000) // the full rest
    expect(store.draft).toBeNull()
    expect(store.loggedSets).toHaveLength(1)
    expect(store.loggedSets[0]?.weightKg).toBe(7.5)
    expect(store.loggedSets[0]?.exerciseId).toBe('goblet-squat')
  })

  it('never auto-commits while paused', () => {
    const { clock, store } = toFirstRest()
    store.togglePause()

    // The entry stays open and editable for as long as the user is paused,
    // however long that is (spec section 3.3).
    clock.advance(20 * 60 * 1000)
    for (let i = 0; i < 20; i += 1) store.tick()

    expect(store.draft).not.toBeNull()
    expect(store.loggedSets).toHaveLength(0)

    store.adjustWeight(1)
    expect(store.draft?.weightKg).toBe(7.5)
  })

  it('commits on resume once the rest finishes', () => {
    const { clock, store } = toFirstRest()
    store.togglePause()
    clock.advance(600_000)
    store.togglePause()

    run(clock, store, 20_000)
    expect(store.loggedSets).toHaveLength(1)
  })

  it('logs the pre-filled weight when the user skips entry entirely', () => {
    const { clock, store } = toFirstRest()
    run(clock, store, 20_000)

    expect(store.loggedSets).toHaveLength(1)
    expect(store.loggedSets[0]?.weightKg).toBe(5)
  })

  it('advances early when the user taps Next', () => {
    const { store } = toFirstRest()
    store.commitAndAdvance()

    expect(store.loggedSets).toHaveLength(1)
    expect(store.currentSegment?.type).toBe('work')
    expect(store.currentExercise?.id).toBe('db-bench-press')
  })

  it('commits every set across a whole session', () => {
    const clock = fakeClock()
    const store = useSessionStore()
    useSettingsStore().update({ leadIn: false })
    store.start('session-a', { clock: clock.now })

    run(clock, store, 870_000)
    // Four exercises across three rounds.
    expect(store.loggedSets).toHaveLength(12)
    expect(store.isComplete).toBe(true)
  })

  it('logs sets even when the tab was hidden through several segments', () => {
    const clock = fakeClock()
    const store = useSessionStore()
    useSettingsStore().update({ leadIn: false })
    store.start('session-a', { clock: clock.now })

    // One jump across the warm-up and two whole exercise slots.
    run(clock, store, 250_000)
    expect(store.loggedSets.length).toBeGreaterThanOrEqual(2)
  })

  it('pre-fills from the previous session once history exists', () => {
    const history = useHistoryStore()
    const clock = fakeClock()
    const store = useSessionStore()
    useSettingsStore().update({ leadIn: false })

    store.start('session-a', { clock: clock.now })
    run(clock, store, 130_000)
    store.setWeightFromDisplay(22.5)
    run(clock, store, 20_000)
    expect(history.sets).toHaveLength(1)

    // A second session should open on the weight the first one finished at.
    const clock2 = fakeClock(2_000_000_000_000)
    store.start('session-a', { clock: clock2.now })
    run(clock2, store, 130_000)

    expect(store.draft?.weightKg).toBe(22.5)
    expect(store.draft?.isCalibration).toBe(false)
  })

  it('records the session log with working and elapsed time', () => {
    const history = useHistoryStore()
    const clock = fakeClock()
    const store = useSessionStore()
    useSettingsStore().update({ leadIn: false })

    store.start('session-a', { clock: clock.now })
    expect(history.sessionLogs).toHaveLength(1)
    expect(history.sessionLogs[0]?.completed).toBe(false)

    run(clock, store, 870_000)
    expect(history.sessionLogs[0]?.completed).toBe(true)
    expect(history.sessionLogs[0]?.workingTimeMs).toBe(870_000)
  })

  it('keeps a partial session when ended early', () => {
    const history = useHistoryStore()
    const clock = fakeClock()
    const store = useSessionStore()
    useSettingsStore().update({ leadIn: false })

    store.start('session-a', { clock: clock.now })
    run(clock, store, 140_000) // mid-rest, with an entry open
    store.end()

    // The open entry still counts: the work was done, only the rest was cut.
    expect(store.loggedSets).toHaveLength(1)
    expect(history.sessionLogs[0]?.completed).toBe(false)
    expect(history.sessionLogs[0]?.endedAt).not.toBeNull()
  })

  it('tracks whether every pre-fill was left alone, for the ramp-up rule', () => {
    const { clock, store } = toFirstRest()
    expect(store.allPrefillsUntouched).toBe(true)

    store.adjustWeight(1)
    run(clock, store, 20_000)
    expect(store.allPrefillsUntouched).toBe(false)
  })
})
