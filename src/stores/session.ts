import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import {
  createTimerEngine,
  type TimerEngine,
  type TimerEvent,
  type TimerSnapshot,
} from '@/engine/timer'
import { buildSegmentList, nextExerciseSegment, type Segment } from '@/engine/segments'
import { getSessionTemplate, NO_BENCH_SUBSTITUTIONS } from '@/data/sessions'
import { getExercise } from '@/data/exercises'
import { useSettingsStore } from './settings'

export interface StartOptions {
  /** Injected for tests so a 14:30 session does not take 14:30. */
  readonly clock?: () => number
}

/**
 * Reactive wrapper around the timer engine.
 *
 * Holds no DOM listeners and no interval of its own — `useSessionRunner` drives
 * `tick()`, and audio, haptics, wake lock and persistence subscribe through
 * `onEvent`. The store's job is state, not side effects.
 */
export const useSessionStore = defineStore('session', () => {
  const engine = shallowRef<TimerEngine | null>(null)
  const segments = shallowRef<readonly Segment[]>([])
  const snapshot = ref<TimerSnapshot | null>(null)
  const sessionId = ref<string | null>(null)

  const listeners = new Set<(event: TimerEvent) => void>()

  /** Subscribe to timer events. Returns an unsubscribe function. */
  function onEvent(listener: (event: TimerEvent) => void): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  function apply(result: { snapshot: TimerSnapshot; events: readonly TimerEvent[] }): void {
    snapshot.value = result.snapshot
    for (const event of result.events) {
      for (const listener of listeners) listener(event)
    }
  }

  const status = computed(() => snapshot.value?.status ?? 'idle')
  const isRunning = computed(() => status.value === 'running')
  const isPaused = computed(() => status.value === 'paused')
  const isComplete = computed(() => status.value === 'complete')
  const isActive = computed(() => isRunning.value || isPaused.value)

  const currentSegment = computed(() => snapshot.value?.segment)

  const currentExercise = computed(() => {
    const id = currentSegment.value?.exerciseId
    return id ? getExercise(id) : undefined
  })

  const nextSegment = computed(() => {
    const index = snapshot.value?.index
    if (index === undefined) return undefined
    return nextExerciseSegment(segments.value, index)
  })

  const nextExercise = computed(() => {
    const id = nextSegment.value?.exerciseId
    return id ? getExercise(id) : undefined
  })

  /** Progress through the whole session, 0 to 1, for the progress bar. */
  const progress = computed(() => {
    const current = snapshot.value
    if (!current) return 0
    const total = segments.value.reduce((sum, segment) => sum + segment.durationMs, 0)
    if (total === 0) return 0
    return Math.min(1, Math.max(0, 1 - current.totalRemainingMs / total))
  })

  function start(templateId: string, options: StartOptions = {}): void {
    const settingsStore = useSettingsStore()
    const template = getSessionTemplate(templateId)

    const list = buildSegmentList(template, {
      leadIn: settingsStore.settings.leadIn,
      // The no-bench answer is the only reason the substitutions field exists.
      ...(settingsStore.settings.hasBench ? {} : { substitutions: NO_BENCH_SUBSTITUTIONS }),
    })

    segments.value = list
    sessionId.value = templateId
    engine.value = createTimerEngine({
      segments: list,
      ...(options.clock ? { clock: options.clock } : {}),
    })

    apply(engine.value.start())
  }

  function tick(): void {
    if (engine.value) apply(engine.value.tick())
  }

  function pause(): void {
    if (engine.value) apply(engine.value.pause())
  }

  function resume(): void {
    if (engine.value) apply(engine.value.resume())
  }

  function togglePause(): void {
    if (isPaused.value) resume()
    else if (isRunning.value) pause()
  }

  function skipForward(): void {
    if (engine.value) apply(engine.value.skipForward())
  }

  function skipBack(): void {
    if (engine.value) apply(engine.value.skipBack())
  }

  function extend(ms: number): void {
    if (engine.value) apply(engine.value.extend(ms))
  }

  function end(): void {
    if (engine.value) apply(engine.value.end())
  }

  /** Clears everything. Called when leaving the player. */
  function reset(): void {
    engine.value = null
    segments.value = []
    snapshot.value = null
    sessionId.value = null
  }

  return {
    // state
    segments,
    snapshot,
    sessionId,
    // derived
    status,
    isRunning,
    isPaused,
    isComplete,
    isActive,
    currentSegment,
    currentExercise,
    nextSegment,
    nextExercise,
    progress,
    // actions
    start,
    tick,
    pause,
    resume,
    togglePause,
    skipForward,
    skipBack,
    extend,
    end,
    reset,
    onEvent,
  }
})
