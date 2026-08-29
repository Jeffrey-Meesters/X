import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useSessionStore } from './session'
import { useSettingsStore } from './settings'
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
