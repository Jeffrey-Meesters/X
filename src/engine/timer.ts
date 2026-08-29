import type { Segment } from './segments'

/**
 * The session timer, as a pure state machine over a pre-computed segment list.
 *
 * No Vue, no Pinia, no timers of its own. The caller drives it by calling
 * `tick()` on whatever cadence suits the display (100ms is plenty), and the
 * engine derives everything from wall-clock timestamps. That is what makes a
 * 14:30 session testable in microseconds via the injected clock.
 *
 * Spec section 6 is the contract this implements.
 */

export type TimerStatus = 'idle' | 'running' | 'paused' | 'complete'

export type TimerEventKind =
  /** A segment began. Drives the work/rest tone and the aria-live announcement. */
  | 'segment-start'
  /** A segment ran to its end. Distinct from segment-start so tones can differ. */
  | 'segment-end'
  /** Midpoint of a unilateral work interval: switch sides. */
  | 'halfway'
  /** 3-2-1 during the lead-in. `value` carries which. */
  | 'countdown'
  /** ~5s before a transition ends: speak the next exercise. */
  | 'announce-next'
  /** The final segment finished. */
  | 'complete'

export interface TimerEvent {
  readonly kind: TimerEventKind
  /** Wall-clock time the event was due, which may be before `now` after a catch-up. */
  readonly atMs: number
  /**
   * True when this fired materially later than it was due — the tab was hidden
   * and the engine caught up through segments that elapsed while throttled.
   *
   * Audio and haptics must drop these: spec section 6.3 forbids replaying cues
   * retroactively. The engine flags them rather than filtering, so the UI can
   * still use them to move state forward.
   */
  readonly missed: boolean
  readonly segmentIndex: number
  /** Set on `countdown` events: 3, 2 or 1. */
  readonly value?: number
}

export interface TimerSnapshot {
  readonly status: TimerStatus
  readonly index: number
  readonly segment: Segment | undefined
  readonly remainingMs: number
  readonly elapsedInSegmentMs: number
  readonly segmentDurationMs: number
  /** Remaining across the whole session, current segment included. */
  readonly totalRemainingMs: number
  /** Time spent counting down, excluding every pause. Spec section 6.5. */
  readonly workingTimeMs: number
  /** Wall-clock time since start, pauses included. */
  readonly totalElapsedMs: number
  readonly isPaused: boolean
}

export interface TickResult {
  readonly snapshot: TimerSnapshot
  readonly events: readonly TimerEvent[]
}

/**
 * Everything needed to rebuild an in-flight session after a crash or reload.
 * `durations` is included because `extend()` mutates it — without persisting it
 * a restored session would silently lose the rest the user added.
 */
export interface PersistableTimerState {
  readonly index: number
  readonly segmentStartedAt: number
  readonly pausedAccumulatedMs: number
  readonly isPaused: boolean
  readonly startedAt: number
  readonly totalPausedMs: number
  readonly durations: readonly number[]
}

/**
 * Enough to rebuild an interrupted session (spec section 3.0.1).
 *
 * Position is stored as elapsed-within-segment rather than as a wall-clock
 * start time, because the two cannot be reconciled after an arbitrary gap: a
 * session saved while paused has a frozen position that its raw timestamps no
 * longer describe. Storing the frozen position directly makes restoring exact
 * whether the session was running or paused when it was interrupted.
 */
export interface RestoreState {
  readonly index: number
  readonly elapsedInSegmentMs: number
  readonly workingTimeMs: number
  readonly totalElapsedMs: number
  /** Durations as they stood, so an extended rest survives the interruption. */
  readonly durations: readonly number[]
}

export interface TimerEngineOptions {
  readonly segments: readonly Segment[]
  /** Injectable clock. Defaults to wall time; tests pass a fake. */
  readonly clock?: () => number
  /**
   * Rebuild an interrupted session instead of starting fresh. The engine comes
   * back **paused**, always: never resume a live countdown into someone's
   * pocket (spec section 3.0.1).
   */
  readonly restore?: RestoreState
  /**
   * An event fired more than this long after it was due is marked `missed`.
   * Comfortably above a normal display tick, far below any real backgrounding.
   */
  readonly missedThresholdMs?: number
}

/** Lead time for the spoken "next up ..." announcement during a transition. */
export const ANNOUNCE_LEAD_MS = 5_000

const DEFAULT_MISSED_THRESHOLD_MS = 1_500

interface PointEvent {
  readonly kind: TimerEventKind
  /** Elapsed-within-segment offset at which it is due. */
  readonly atElapsed: number
  readonly value?: number
}

/**
 * Point-in-time cues inside a segment, recomputed from the segment's *current*
 * duration so that extending a rest also moves its "next up" announcement.
 */
function pointEventsFor(
  segment: Segment,
  durationMs: number,
  hasNext: boolean,
): readonly PointEvent[] {
  const events: PointEvent[] = []

  if (segment.halfwayCue && durationMs > 0) {
    events.push({ kind: 'halfway', atElapsed: durationMs / 2 })
  }

  if (segment.type === 'lead-in') {
    for (const value of [3, 2, 1]) {
      const atElapsed = durationMs - value * 1000
      if (atElapsed > 0) events.push({ kind: 'countdown', atElapsed, value })
    }
  }

  // Nothing to announce if this rest ends the session.
  if (segment.type === 'transition' && hasNext) {
    const atElapsed = durationMs - ANNOUNCE_LEAD_MS
    if (atElapsed > 0) events.push({ kind: 'announce-next', atElapsed })
  }

  return events.sort((a, b) => a.atElapsed - b.atElapsed)
}

export interface TimerEngine {
  start(): TickResult
  tick(): TickResult
  pause(): TickResult
  resume(): TickResult
  skipForward(): TickResult
  skipBack(): TickResult
  /** Extend the current segment only; later segments keep their durations. */
  extend(ms: number): TickResult
  /** Finish early. Whatever was completed is kept. */
  end(): TickResult
  snapshot(): TimerSnapshot
  /** State for crash-recovery autosave. */
  persistableState(): PersistableTimerState
  readonly segments: readonly Segment[]
}

export function createTimerEngine(options: TimerEngineOptions): TimerEngine {
  const {
    segments,
    clock = () => Date.now(),
    missedThresholdMs = DEFAULT_MISSED_THRESHOLD_MS,
    restore,
  } = options

  if (segments.length === 0) throw new Error('Cannot run a session with no segments')

  let status: TimerStatus = 'idle'
  let index = 0
  let segmentStartedAt = 0
  /** Paused time inside the *current* segment; resets on every transition. */
  let pausedAccumulatedMs = 0
  let pausedAt: number | null = null
  /** Paused time across the whole session; never resets. */
  let totalPausedMs = 0
  let startedAt = 0
  let endedAt: number | null = null
  /** Mutable so `extend()` can lengthen a single segment. */
  const durations: number[] = restore
    ? segments.map((segment, i) => restore.durations[i] ?? segment.durationMs)
    : segments.map((segment) => segment.durationMs)
  /** Highest elapsed offset already observed in the current segment. */
  let lastElapsed = 0
  /** Events raised by control actions, drained by the next tick. */
  let pending: TimerEvent[] = []

  if (restore) {
    const now = clock()
    status = 'paused'
    index = Math.min(Math.max(0, restore.index), segments.length - 1)
    // Synthesise timestamps that reproduce the saved position exactly, then
    // freeze there. Resuming credits the whole gap to paused time, so the
    // countdown continues from where it stopped rather than jumping.
    segmentStartedAt = now - restore.elapsedInSegmentMs
    pausedAccumulatedMs = 0
    pausedAt = now
    lastElapsed = restore.elapsedInSegmentMs
    startedAt = now - restore.totalElapsedMs
    totalPausedMs = Math.max(0, restore.totalElapsedMs - restore.workingTimeMs)
  }

  const durationAt = (i: number): number => durations[i] ?? 0

  /**
   * The clock as the session experiences it: frozen at the moment of pausing,
   * so a paused countdown does not move and cannot cross a boundary.
   */
  const effectiveNow = (): number => (pausedAt !== null ? pausedAt : clock())

  const elapsedInSegment = (now: number): number =>
    Math.max(0, now - segmentStartedAt - pausedAccumulatedMs)

  function makeEvent(
    kind: TimerEventKind,
    atMs: number,
    segmentIndex: number,
    value?: number,
  ): TimerEvent {
    return {
      kind,
      atMs,
      missed: clock() - atMs > missedThresholdMs,
      segmentIndex,
      ...(value !== undefined ? { value } : {}),
    }
  }

  function buildSnapshot(): TimerSnapshot {
    const now = effectiveNow()
    const segment = segments[index]
    const segmentDurationMs = durationAt(index)

    const elapsed = status === 'idle' ? 0 : Math.min(elapsedInSegment(now), segmentDurationMs)
    const remainingMs = status === 'complete' ? 0 : Math.max(0, segmentDurationMs - elapsed)

    let totalRemainingMs = remainingMs
    if (status !== 'complete') {
      for (let i = index + 1; i < durations.length; i += 1) totalRemainingMs += durationAt(i)
    }

    // An in-progress pause is not yet in totalPausedMs, so add it here or a
    // paused session would appear to keep accruing working time.
    const ongoingPause = pausedAt !== null ? clock() - pausedAt : 0
    const reference = endedAt ?? clock()
    const totalElapsedMs = status === 'idle' ? 0 : Math.max(0, reference - startedAt)
    const workingTimeMs = Math.max(0, totalElapsedMs - totalPausedMs - ongoingPause)

    return {
      status,
      index,
      segment,
      remainingMs,
      elapsedInSegmentMs: elapsed,
      segmentDurationMs,
      totalRemainingMs,
      workingTimeMs,
      totalElapsedMs,
      isPaused: status === 'paused',
    }
  }

  function drain(extra: TimerEvent[] = []): TickResult {
    const events = [...pending, ...extra]
    pending = []
    return { snapshot: buildSnapshot(), events }
  }

  /** Emit the point cues of the current segment falling in (from, to]. */
  function collectPointEvents(from: number, to: number, into: TimerEvent[]): void {
    const segment = segments[index]
    if (!segment) return

    const hasNext = index < segments.length - 1
    for (const point of pointEventsFor(segment, durationAt(index), hasNext)) {
      if (point.atElapsed > from && point.atElapsed <= to) {
        const atMs = segmentStartedAt + point.atElapsed + pausedAccumulatedMs
        into.push(makeEvent(point.kind, atMs, index, point.value))
      }
    }
  }

  function advanceTo(nextIndex: number, at: number): void {
    index = nextIndex
    segmentStartedAt = at
    pausedAccumulatedMs = 0
    lastElapsed = 0
  }

  function tick(): TickResult {
    // Idle has not started; complete has nothing left to advance through.
    // Paused freezes everything, including cue emission (spec section 6.5).
    if (status !== 'running') return drain()

    const now = effectiveNow()
    const events: TimerEvent[] = []

    // Loops rather than steps, so a tab hidden across several segments catches
    // up in one tick instead of needing one tick per segment.
    for (;;) {
      const duration = durationAt(index)
      const elapsed = elapsedInSegment(now)

      if (elapsed < duration) {
        collectPointEvents(lastElapsed, elapsed, events)
        lastElapsed = elapsed
        break
      }

      collectPointEvents(lastElapsed, duration, events)

      // Derive the boundary by arithmetic, never from `now`. Using `now` would
      // push the rest of the session later by however long the tab was hidden.
      const boundaryAt = segmentStartedAt + duration + pausedAccumulatedMs
      events.push(makeEvent('segment-end', boundaryAt, index))

      const isLast = index >= segments.length - 1
      if (isLast) {
        status = 'complete'
        endedAt = boundaryAt
        events.push(makeEvent('complete', boundaryAt, index))
        break
      }

      advanceTo(index + 1, boundaryAt)
      events.push(makeEvent('segment-start', boundaryAt, index))
    }

    return drain(events)
  }

  return {
    segments,

    start(): TickResult {
      // A restored session is already positioned and paused; starting it would
      // throw that away and rewind to the first segment.
      if (status !== 'idle') return drain()
      const now = clock()
      status = 'running'
      startedAt = now
      advanceTo(0, now)
      pending.push(makeEvent('segment-start', now, 0))
      return tick()
    },

    tick,

    pause(): TickResult {
      if (status !== 'running') return drain()
      // Settle any boundary that is already due before freezing, so pausing a
      // hair after a segment ends does not strand the session on a finished one.
      const settled = tick()
      if (status !== 'running') return settled
      pausedAt = clock()
      status = 'paused'
      return { snapshot: buildSnapshot(), events: settled.events }
    },

    resume(): TickResult {
      if (status !== 'paused' || pausedAt === null) return drain()
      const pausedFor = Math.max(0, clock() - pausedAt)
      // Crediting the pause to both counters is what lets the countdown resume
      // exactly where it froze while total elapsed keeps running.
      pausedAccumulatedMs += pausedFor
      totalPausedMs += pausedFor
      pausedAt = null
      status = 'running'
      return tick()
    },

    skipForward(): TickResult {
      if (status !== 'running' && status !== 'paused') return drain()
      const now = effectiveNow()

      if (index >= segments.length - 1) {
        status = 'complete'
        endedAt = clock()
        pending.push(makeEvent('complete', now, index))
        return drain()
      }

      advanceTo(index + 1, now)
      pending.push(makeEvent('segment-start', now, index))
      return status === 'paused' ? drain() : tick()
    },

    skipBack(): TickResult {
      if (status !== 'running' && status !== 'paused') return drain()
      const now = effectiveNow()
      advanceTo(Math.max(0, index - 1), now)
      pending.push(makeEvent('segment-start', now, index))
      return status === 'paused' ? drain() : tick()
    },

    extend(ms: number): TickResult {
      if (status !== 'running' && status !== 'paused') return drain()
      // Only this segment grows. Later segments keep their own durations, so
      // the rest of the schedule shifts in wall-clock but is not rewritten.
      durations[index] = Math.max(0, durationAt(index) + ms)
      return status === 'paused' ? drain() : tick()
    },

    end(): TickResult {
      if (status === 'complete' || status === 'idle') return drain()
      status = 'complete'
      endedAt = clock()
      if (pausedAt !== null) {
        totalPausedMs += Math.max(0, clock() - pausedAt)
        pausedAt = null
      }
      return drain()
    },

    snapshot: buildSnapshot,

    persistableState(): PersistableTimerState {
      return {
        index,
        segmentStartedAt,
        pausedAccumulatedMs,
        isPaused: status === 'paused',
        startedAt,
        totalPausedMs,
        durations: [...durations],
      }
    },
  }
}
