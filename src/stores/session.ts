import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import {
  createTimerEngine,
  type TimerEngine,
  type TimerEvent,
  type TimerSnapshot,
} from '@/engine/timer'
import { buildSegmentList, nextExerciseSegment, type Segment } from '@/engine/segments'
import type { ActiveSessionRecord } from '@/persistence/db'
import { getSessionTemplate, substitutionsFor } from '@/data/sessions'
import { getExercise } from '@/data/exercises'
import { prefillWeightKg } from '@/engine/progression'
import { fromDisplay, stepWeight } from '@/engine/units'
import type { LoggedSet, RepRange } from '@/types/models'
import { PROGRAM } from '@/data/sessions'
import { useSettingsStore } from './settings'
import { useHistoryStore } from './history'

/** An in-progress weight entry, open during the rest after a work interval. */
export interface SetDraft {
  readonly segmentIndex: number
  readonly exerciseId: string
  readonly round: number
  readonly targetReps: RepRange
  weightKg: number
  reps: number
  rir: number | null
  /** Whether the user changed the pre-filled weight. Drives the ramp-up rule. */
  touched: boolean
  /**
   * Whether the user engaged with this entry at all, by any route. Distinct
   * from `touched`, which is specifically about the weight: confirming a set
   * unchanged is still a signal, changing the weight is additionally a reason
   * not to offer a doubled increment.
   */
  confirmed: boolean
  /** No previous weight existed, so this is a calibration entry. */
  readonly isCalibration: boolean
}

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
  const sessionLogId = ref<string | null>(null)

  const draft = ref<SetDraft | null>(null)
  /** Sets logged during this session, in order. */
  const loggedSets = ref<LoggedSet[]>([])
  /** True while the user has left every pre-filled weight alone this session. */
  const allPrefillsUntouched = ref(true)

  const listeners = new Set<(event: TimerEvent) => void>()

  /** Subscribe to timer events. Returns an unsubscribe function. */
  function onEvent(listener: (event: TimerEvent) => void): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  function apply(result: { snapshot: TimerSnapshot; events: readonly TimerEvent[] }): void {
    const wasComplete = snapshot.value?.status === 'complete'
    snapshot.value = result.snapshot

    for (const event of result.events) {
      // A rest beginning is where the set just finished gets logged.
      if (event.kind === 'segment-start') {
        const segment = segments.value[event.segmentIndex]
        if (segment?.type === 'transition') openDraft(segment)
      }
    }

    // Reconciling against the snapshot rather than only against a segment-end
    // event covers every route out of a rest: the countdown reaching zero, a
    // manual skip, and catching up through several segments after the tab was
    // hidden. A draft that is no longer on screen has to be committed.
    const current = snapshot.value
    const open = draft.value
    if (open && (!current || current.index !== open.segmentIndex)) commitDraft()

    // Reaching the end closes the log exactly once, however it was reached.
    if (!wasComplete && result.snapshot.status === 'complete') finishLog(true)

    for (const event of result.events) {
      for (const listener of listeners) listener(event)
    }
  }

  function openDraft(transition: Segment): void {
    // Catching up through a hidden tab can start several rests in one tick.
    // Committing the outgoing draft first means each set is kept at its
    // pre-filled weight rather than being overwritten by the next one.
    if (draft.value) commitDraft()

    const history = useHistoryStore()
    const settingsStore = useSettingsStore()

    // The work interval this rest belongs to is the segment just before it.
    const work = segments.value[transition.index - 1]
    if (!work || work.type !== 'work') return

    const lastSessionSets = history.lastSessionSetsFor(
      work.exerciseId,
      sessionLogId.value ?? undefined,
    )

    // An accepted progression nudge is a deliberate instruction for this
    // session, so it takes precedence over what was last lifted.
    const accepted = history.targetFor(work.exerciseId)

    draft.value = {
      segmentIndex: transition.index,
      exerciseId: work.exerciseId,
      round: work.round ?? 1,
      targetReps: work.targetReps ?? [8, 12],
      weightKg:
        accepted ?? prefillWeightKg({ lastSessionSets, units: settingsStore.settings.units }),
      // Reps default to the target; the user taps down if they fell short.
      reps: work.targetReps?.[1] ?? 0,
      rir: null,
      touched: false,
      confirmed: false,
      isCalibration: lastSessionSets.length === 0,
    }
  }

  /** Writes the open draft to history. Safe to call when nothing is open. */
  function commitDraft(): void {
    const open = draft.value
    if (!open) return
    draft.value = null

    const set: LoggedSet = {
      id: crypto.randomUUID(),
      sessionLogId: sessionLogId.value ?? '',
      exerciseId: open.exerciseId,
      round: open.round,
      weightKg: open.weightKg,
      reps: open.reps,
      rir: open.rir,
      confirmed: open.confirmed,
      completedAt: new Date().toISOString(),
    }

    loggedSets.value = [...loggedSets.value, set]
    if (open.touched) allPrefillsUntouched.value = false
    void useHistoryStore().addSet(set)
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

    // The no-bench answer is the only reason the substitutions field exists.
    const substitutions = substitutionsFor(settingsStore.settings.hasBench)
    const list = buildSegmentList(template, {
      leadIn: settingsStore.settings.leadIn,
      ...(substitutions ? { substitutions } : {}),
    })

    segments.value = list
    sessionId.value = templateId
    sessionLogId.value = crypto.randomUUID()
    loggedSets.value = []
    draft.value = null
    allPrefillsUntouched.value = true

    void useHistoryStore().startSessionLog({
      id: sessionLogId.value,
      programId: PROGRAM.id,
      sessionId: templateId,
      startedAt: new Date().toISOString(),
      endedAt: null,
      completed: false,
      sets: [],
    })

    engine.value = createTimerEngine({
      segments: list,
      ...(options.clock ? { clock: options.clock } : {}),
    })

    apply(engine.value.start())
  }

  /**
   * Rebuilds an interrupted session. Always comes back paused, so a countdown
   * never resumes into someone's pocket (spec section 3.0.1).
   */
  function restoreFrom(record: ActiveSessionRecord, options: StartOptions = {}): void {
    segments.value = record.segments
    sessionId.value = record.sessionId
    sessionLogId.value = record.sessionLogId
    loggedSets.value = []
    draft.value = null
    allPrefillsUntouched.value = true

    engine.value = createTimerEngine({
      segments: record.segments,
      ...(options.clock ? { clock: options.clock } : {}),
      restore: {
        index: record.segmentIndex,
        elapsedInSegmentMs: record.elapsedInSegmentMs,
        workingTimeMs: record.workingTimeMs,
        totalElapsedMs: record.totalElapsedMs,
        durations: record.segments.map((segment) => segment.durationMs),
      },
    })

    snapshot.value = engine.value.snapshot()

    // A session interrupted during a rest had an entry open; reopening it means
    // the user does not silently lose the set they were part-way through.
    const current = segments.value[record.segmentIndex]
    if (current?.type === 'transition') openDraft(current)
  }

  /** Everything needed to rebuild this session after a crash. */
  function persistableRecord(): ActiveSessionRecord | undefined {
    const current = snapshot.value
    const id = sessionLogId.value
    const template = sessionId.value
    if (!current || !id || !template || !engine.value) return undefined

    const state = engine.value.persistableState()

    return {
      sessionLogId: id,
      sessionId: template,
      startedAt: new Date(Date.now() - current.totalElapsedMs).toISOString(),
      // Durations are folded back into the segments so an extended rest
      // survives; the engine keeps them in a parallel array while running.
      segments: segments.value.map((segment, i) => ({
        ...segment,
        durationMs: state.durations[i] ?? segment.durationMs,
      })),
      segmentIndex: current.index,
      elapsedInSegmentMs: current.elapsedInSegmentMs,
      workingTimeMs: current.workingTimeMs,
      totalElapsedMs: current.totalElapsedMs,
      isPaused: current.isPaused,
      setsLogged: loggedSets.value.map((set) => set.id),
      savedAt: Date.now(),
    }
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
    if (!engine.value) return
    // Whatever was entered but not yet committed still counts as completed work.
    commitDraft()
    apply(engine.value.end())
    finishLog(false)
  }

  function adjustWeight(direction: 1 | -1): void {
    const open = draft.value
    if (!open) return
    const settingsStore = useSettingsStore()
    open.weightKg = stepWeight(
      open.weightKg,
      settingsStore.settings.weightIncrement,
      direction,
      settingsStore.settings.units,
    )
    open.touched = true
    open.confirmed = true
  }

  /** Direct entry from the numeric keypad fallback, in display units. */
  function setWeightFromDisplay(value: number): void {
    const open = draft.value
    if (!open) return
    const settingsStore = useSettingsStore()
    open.weightKg = fromDisplay(Math.max(0, value), settingsStore.settings.units)
    open.touched = true
    open.confirmed = true
  }

  function adjustReps(delta: number): void {
    const open = draft.value
    if (!open) return
    open.reps = Math.max(0, open.reps + delta)
    open.confirmed = true
  }

  function setRir(value: number | null): void {
    if (!draft.value) return
    draft.value.rir = value
    draft.value.confirmed = true
  }

  /** The Next button: log the set and move on without waiting out the rest. */
  function commitAndAdvance(): void {
    // Tapping Next is itself a confirmation, even with nothing changed.
    if (draft.value) draft.value.confirmed = true
    commitDraft()
    skipForward()
  }

  /** Marks the session log finished. Called on completion or an early end. */
  function finishLog(completed: boolean): void {
    const id = sessionLogId.value
    const current = snapshot.value
    if (!id || !current) return

    void useHistoryStore().finishSessionLog(id, {
      completed,
      endedAt: new Date().toISOString(),
      workingTimeMs: current.workingTimeMs,
      totalElapsedMs: current.totalElapsedMs,
    })
  }

  /** Clears everything. Called when leaving the player. */
  function reset(): void {
    engine.value = null
    segments.value = []
    snapshot.value = null
    sessionId.value = null
    sessionLogId.value = null
    draft.value = null
    loggedSets.value = []
    allPrefillsUntouched.value = true
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
    // set logging
    draft,
    loggedSets,
    allPrefillsUntouched,
    sessionLogId,
    // actions
    start,
    restoreFrom,
    persistableRecord,
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
    adjustWeight,
    setWeightFromDisplay,
    adjustReps,
    setRir,
    commitDraft,
    commitAndAdvance,
    finishLog,
  }
})
