import { describe, it, expect } from 'vitest'
import { createTimerEngine, ANNOUNCE_LEAD_MS, type TimerEvent } from './timer'
import type { Segment, SegmentType } from './segments'
import { buildSegmentList } from './segments'
import { SESSION_A } from '@/data/sessions'

/** Controllable clock. Nothing advances unless a test says so. */
function fakeClock(start = 1_700_000_000_000) {
  let now = start
  return {
    now: () => now,
    advance(ms: number) {
      now += ms
    },
  }
}

let nextIndex = 0
function seg(type: SegmentType, durationMs: number, extra: Partial<Segment> = {}): Segment {
  return {
    index: nextIndex++,
    type,
    exerciseId: 'goblet-squat',
    durationMs,
    halfwayCue: false,
    ...extra,
  }
}

/** A short session: 10s warm-up, 40s work, 20s rest, 30s finisher. */
function shortSession(): Segment[] {
  nextIndex = 0
  return [
    seg('warmup', 10_000),
    seg('work', 40_000, { round: 1, totalRounds: 1, targetReps: [8, 12] }),
    seg('transition', 20_000, { round: 1, totalRounds: 1 }),
    seg('finisher', 30_000),
  ]
}

const kinds = (events: readonly TimerEvent[]) => events.map((e) => e.kind)

describe('sequencing', () => {
  it('starts on the first segment with its full duration showing', () => {
    const clock = fakeClock()
    const engine = createTimerEngine({ segments: shortSession(), clock: clock.now })

    const { snapshot, events } = engine.start()
    expect(snapshot.status).toBe('running')
    expect(snapshot.index).toBe(0)
    expect(snapshot.remainingMs).toBe(10_000)
    expect(kinds(events)).toContain('segment-start')
  })

  it('counts down without advancing early', () => {
    const clock = fakeClock()
    const engine = createTimerEngine({ segments: shortSession(), clock: clock.now })
    engine.start()

    clock.advance(9_999)
    const { snapshot, events } = engine.tick()
    expect(snapshot.index).toBe(0)
    expect(snapshot.remainingMs).toBe(1)
    expect(kinds(events)).not.toContain('segment-end')
  })

  it('advances exactly on the boundary', () => {
    const clock = fakeClock()
    const engine = createTimerEngine({ segments: shortSession(), clock: clock.now })
    engine.start()

    clock.advance(10_000)
    const { snapshot, events } = engine.tick()
    expect(snapshot.index).toBe(1)
    expect(snapshot.remainingMs).toBe(40_000)
    expect(kinds(events)).toEqual(['segment-end', 'segment-start'])
  })

  it('completes after the final segment and stays complete', () => {
    const clock = fakeClock()
    const engine = createTimerEngine({ segments: shortSession(), clock: clock.now })
    engine.start()

    clock.advance(100_000) // 10 + 40 + 20 + 30
    const first = engine.tick()
    expect(first.snapshot.status).toBe('complete')
    expect(kinds(first.events)).toContain('complete')

    clock.advance(60_000)
    const second = engine.tick()
    expect(second.snapshot.status).toBe('complete')
    expect(second.events).toHaveLength(0)
  })

  it('reports remaining time across the whole session', () => {
    const clock = fakeClock()
    const engine = createTimerEngine({ segments: shortSession(), clock: clock.now })
    engine.start()
    expect(engine.snapshot().totalRemainingMs).toBe(100_000)

    clock.advance(15_000)
    expect(engine.tick().snapshot.totalRemainingMs).toBe(85_000)
  })
})

describe('pause and resume arithmetic', () => {
  it('freezes the countdown at its exact position', () => {
    const clock = fakeClock()
    const engine = createTimerEngine({ segments: shortSession(), clock: clock.now })
    engine.start()

    clock.advance(4_000)
    engine.tick()
    const frozen = engine.pause().snapshot.remainingMs
    expect(frozen).toBe(6_000)

    clock.advance(600_000) // ten minutes changing plates
    expect(engine.tick().snapshot.remainingMs).toBe(6_000)
    expect(engine.snapshot().status).toBe('paused')
  })

  it('resumes from exactly where it froze', () => {
    const clock = fakeClock()
    const engine = createTimerEngine({ segments: shortSession(), clock: clock.now })
    engine.start()

    clock.advance(4_000)
    engine.pause()
    clock.advance(600_000)
    engine.resume()

    expect(engine.snapshot().remainingMs).toBe(6_000)
    clock.advance(6_000)
    expect(engine.tick().snapshot.index).toBe(1)
  })

  it('never times a pause out, however long it lasts', () => {
    const clock = fakeClock()
    const engine = createTimerEngine({ segments: shortSession(), clock: clock.now })
    engine.start()
    engine.pause()

    clock.advance(8 * 60 * 60 * 1000) // eight hours
    const { snapshot, events } = engine.tick()
    expect(snapshot.status).toBe('paused')
    expect(snapshot.remainingMs).toBe(10_000)
    expect(events).toHaveLength(0)
  })

  it('survives repeated pause/resume cycles without drifting', () => {
    const clock = fakeClock()
    const engine = createTimerEngine({ segments: shortSession(), clock: clock.now })
    engine.start()

    for (let i = 0; i < 5; i += 1) {
      clock.advance(1_000)
      engine.tick()
      engine.pause()
      clock.advance(30_000)
      engine.resume()
    }

    // 5s of real counting done, so 5s left on a 10s segment.
    expect(engine.snapshot().remainingMs).toBe(5_000)
    expect(engine.snapshot().index).toBe(0)
  })

  it('emits no cues at all while paused', () => {
    const clock = fakeClock()
    const engine = createTimerEngine({ segments: shortSession(), clock: clock.now })
    engine.start()
    engine.pause()

    clock.advance(120_000)
    expect(engine.tick().events).toHaveLength(0)
    expect(engine.tick().events).toHaveLength(0)
  })

  it('ignores resume when not paused, and pause when not running', () => {
    const clock = fakeClock()
    const engine = createTimerEngine({ segments: shortSession(), clock: clock.now })

    expect(engine.pause().snapshot.status).toBe('idle')
    engine.start()
    expect(engine.resume().snapshot.status).toBe('running')
  })
})

describe('auto-commit suppression while paused', () => {
  it('never ends a transition segment while paused', () => {
    const clock = fakeClock()
    const engine = createTimerEngine({ segments: shortSession(), clock: clock.now })
    engine.start()

    clock.advance(55_000) // through warm-up and work, 5s into the 20s transition
    engine.tick()
    expect(engine.snapshot().segment?.type).toBe('transition')
    expect(engine.snapshot().remainingMs).toBe(15_000)

    engine.pause()
    const startIndex = engine.snapshot().index

    // A set's weight entry stays open and editable for as long as this holds.
    clock.advance(15 * 60 * 1000)
    for (let i = 0; i < 20; i += 1) {
      const { snapshot, events } = engine.tick()
      expect(snapshot.index).toBe(startIndex)
      expect(kinds(events)).not.toContain('segment-end')
    }

    // Resuming lets it finish normally: 5s of the 20s rest was already spent,
    // so the remaining 15s still has to run.
    engine.resume()
    clock.advance(14_900)
    expect(engine.tick().snapshot.index).toBe(startIndex)
    clock.advance(100)
    expect(engine.tick().snapshot.index).toBe(startIndex + 1)
  })
})

describe('backgrounding catch-up', () => {
  it('advances through every segment that elapsed while hidden', () => {
    const clock = fakeClock()
    const engine = createTimerEngine({ segments: shortSession(), clock: clock.now })
    engine.start()

    clock.advance(55_000) // warm-up + work done, 5s into the 20s transition
    const { snapshot } = engine.tick()
    expect(snapshot.index).toBe(2)
    expect(snapshot.remainingMs).toBe(15_000)
  })

  it('does NOT drift the rest of the session by the hidden duration', () => {
    const clock = fakeClock()
    const engine = createTimerEngine({ segments: shortSession(), clock: clock.now })
    engine.start()

    // One tick after a long gap must land in the same place as many small ticks.
    clock.advance(70_000)
    engine.tick()

    // 70s in: warm-up (10) + work (40) + transition (20) are done exactly, so
    // the finisher has just started with its full 30s. A boundary derived from
    // `now` instead of arithmetic would leave time on the transition here.
    expect(engine.snapshot().index).toBe(3)
    expect(engine.snapshot().remainingMs).toBe(30_000)

    clock.advance(30_000)
    expect(engine.tick().snapshot.status).toBe('complete')
  })

  it('lands identically whether ticked finely or in one jump', () => {
    const fine = createTimerEngine({ segments: shortSession(), clock: (() => {
      return () => fineClock.now()
    })() })
    const fineClock = fakeClock()
    const coarseClock = fakeClock()
    const coarse = createTimerEngine({ segments: shortSession(), clock: coarseClock.now })

    fine.start()
    coarse.start()

    for (let i = 0; i < 640; i += 1) {
      fineClock.advance(100)
      fine.tick()
    }
    coarseClock.advance(64_000)
    coarse.tick()

    expect(fine.snapshot().index).toBe(coarse.snapshot().index)
    expect(fine.snapshot().remainingMs).toBe(coarse.snapshot().remainingMs)
  })

  it('marks cues that elapsed while hidden as missed', () => {
    const clock = fakeClock()
    const engine = createTimerEngine({ segments: shortSession(), clock: clock.now })
    engine.start()

    clock.advance(55_000)
    const { events } = engine.tick()

    const boundaries = events.filter((e) => e.kind === 'segment-end')
    expect(boundaries.length).toBeGreaterThan(1)
    // Audio drops these, so returning from a hidden tab does not replay a
    // burst of beeps for intervals that already went by.
    expect(boundaries.every((e) => e.missed)).toBe(true)
  })

  it('does not mark an on-time cue as missed', () => {
    const clock = fakeClock()
    const engine = createTimerEngine({ segments: shortSession(), clock: clock.now })
    engine.start()

    clock.advance(10_000)
    const { events } = engine.tick()
    expect(events.every((e) => !e.missed)).toBe(true)
  })

  it('still fires a boundary that only just happened', () => {
    const clock = fakeClock()
    const engine = createTimerEngine({ segments: shortSession(), clock: clock.now })
    engine.start()

    // 200ms late is a normal display tick, not a backgrounded tab.
    clock.advance(10_200)
    const { events } = engine.tick()
    expect(events.find((e) => e.kind === 'segment-start')?.missed).toBe(false)
  })

  it('accounts for pauses when catching up', () => {
    const clock = fakeClock()
    const engine = createTimerEngine({ segments: shortSession(), clock: clock.now })
    engine.start()

    clock.advance(5_000)
    engine.pause()
    clock.advance(120_000)
    engine.resume()

    // 5s of the warm-up was spent before the pause, so 5s remains.
    expect(engine.snapshot().remainingMs).toBe(5_000)

    // Now background for long enough to clear the warm-up and the work interval.
    clock.advance(50_000)
    const { snapshot } = engine.tick()
    expect(snapshot.index).toBe(2)
    expect(snapshot.remainingMs).toBe(15_000)
  })
})

describe('halfway side-switch cue', () => {
  it('fires at the midpoint of a flagged work interval', () => {
    nextIndex = 0
    const segments = [seg('work', 40_000, { halfwayCue: true })]
    const clock = fakeClock()
    const engine = createTimerEngine({ segments, clock: clock.now })
    engine.start()

    clock.advance(19_900)
    expect(kinds(engine.tick().events)).not.toContain('halfway')

    clock.advance(200) // crosses 20s
    expect(kinds(engine.tick().events)).toContain('halfway')
  })

  it('fires exactly once', () => {
    nextIndex = 0
    const segments = [seg('work', 40_000, { halfwayCue: true }), seg('transition', 10_000)]
    const clock = fakeClock()
    const engine = createTimerEngine({ segments, clock: clock.now })
    engine.start()

    let halfways = 0
    for (let i = 0; i < 400; i += 1) {
      clock.advance(100)
      halfways += engine.tick().events.filter((e) => e.kind === 'halfway').length
    }
    expect(halfways).toBe(1)
  })

  it('does not fire on an unflagged interval', () => {
    nextIndex = 0
    const segments = [seg('work', 40_000, { halfwayCue: false })]
    const clock = fakeClock()
    const engine = createTimerEngine({ segments, clock: clock.now })
    engine.start()

    clock.advance(25_000)
    expect(kinds(engine.tick().events)).not.toContain('halfway')
  })
})

describe('lead-in and next-up cues', () => {
  it('counts 3-2-1 through the lead-in', () => {
    nextIndex = 0
    const segments = [seg('lead-in', 5_000), seg('work', 40_000)]
    const clock = fakeClock()
    const engine = createTimerEngine({ segments, clock: clock.now })
    engine.start()

    const values: number[] = []
    for (let i = 0; i < 50; i += 1) {
      clock.advance(100)
      for (const event of engine.tick().events) {
        if (event.kind === 'countdown') values.push(event.value!)
      }
    }
    expect(values).toEqual([3, 2, 1])
  })

  it('announces the next exercise 5s before a rest ends', () => {
    nextIndex = 0
    const segments = [seg('transition', 20_000), seg('work', 40_000)]
    const clock = fakeClock()
    const engine = createTimerEngine({ segments, clock: clock.now })
    engine.start()

    clock.advance(20_000 - ANNOUNCE_LEAD_MS - 100)
    expect(kinds(engine.tick().events)).not.toContain('announce-next')

    clock.advance(200)
    expect(kinds(engine.tick().events)).toContain('announce-next')
  })

  it('skips the announcement when a rest is too short to hold it', () => {
    nextIndex = 0
    const segments = [seg('transition', 3_000), seg('work', 40_000)]
    const clock = fakeClock()
    const engine = createTimerEngine({ segments, clock: clock.now })
    engine.start()

    clock.advance(3_000)
    expect(kinds(engine.tick().events)).not.toContain('announce-next')
  })
})

describe('extending a rest', () => {
  it('adds time to the current segment only', () => {
    const clock = fakeClock()
    const engine = createTimerEngine({ segments: shortSession(), clock: clock.now })
    engine.start()

    clock.advance(55_000) // 5s into the 20s transition
    engine.tick()
    const before = engine.snapshot()
    expect(before.remainingMs).toBe(15_000)

    engine.extend(15_000)
    const after = engine.snapshot()
    expect(after.remainingMs).toBe(30_000)
    // The whole session grows by exactly the extension, so later segments kept
    // their own durations rather than being rescheduled.
    expect(after.totalRemainingMs).toBe(before.totalRemainingMs + 15_000)
  })

  it('leaves the following segment at its normal length', () => {
    const clock = fakeClock()
    const engine = createTimerEngine({ segments: shortSession(), clock: clock.now })
    engine.start()

    clock.advance(50_000)
    engine.tick()
    engine.extend(30_000)

    clock.advance(50_000) // the extended 20 + 30 = 50s rest
    const { snapshot } = engine.tick()
    expect(snapshot.index).toBe(3)
    expect(snapshot.remainingMs).toBe(30_000)
  })

  it('can be applied while paused', () => {
    const clock = fakeClock()
    const engine = createTimerEngine({ segments: shortSession(), clock: clock.now })
    engine.start()
    clock.advance(50_000)
    engine.tick()
    engine.pause()

    engine.extend(15_000)
    expect(engine.snapshot().remainingMs).toBe(35_000)
    expect(engine.snapshot().status).toBe('paused')
  })

  it('re-announces the next exercise against the new end time', () => {
    nextIndex = 0
    const segments = [seg('transition', 20_000), seg('work', 40_000)]
    const clock = fakeClock()
    const engine = createTimerEngine({ segments, clock: clock.now })
    engine.start()

    clock.advance(15_100) // announcement already fired
    expect(kinds(engine.tick().events)).toContain('announce-next')

    engine.extend(15_000) // rest now 35s, so the announcement is due at 30s
    clock.advance(14_900)
    expect(kinds(engine.tick().events)).toContain('announce-next')
  })
})

describe('skipping', () => {
  it('jumps a whole segment forward', () => {
    const clock = fakeClock()
    const engine = createTimerEngine({ segments: shortSession(), clock: clock.now })
    engine.start()

    clock.advance(3_000)
    engine.tick()
    const { snapshot } = engine.skipForward()
    expect(snapshot.index).toBe(1)
    expect(snapshot.remainingMs).toBe(40_000) // full duration, not the remainder
  })

  it('jumps a whole segment back', () => {
    const clock = fakeClock()
    const engine = createTimerEngine({ segments: shortSession(), clock: clock.now })
    engine.start()

    clock.advance(15_000)
    engine.tick()
    expect(engine.snapshot().index).toBe(1)

    const { snapshot } = engine.skipBack()
    expect(snapshot.index).toBe(0)
    expect(snapshot.remainingMs).toBe(10_000)
  })

  it('clamps at the first segment', () => {
    const clock = fakeClock()
    const engine = createTimerEngine({ segments: shortSession(), clock: clock.now })
    engine.start()
    engine.skipBack()
    engine.skipBack()
    expect(engine.snapshot().index).toBe(0)
  })

  it('completes the session when skipping past the last segment', () => {
    const clock = fakeClock()
    const engine = createTimerEngine({ segments: shortSession(), clock: clock.now })
    engine.start()
    for (let i = 0; i < 4; i += 1) engine.skipForward()
    expect(engine.snapshot().status).toBe('complete')
  })

  it('keeps the session paused when skipping while paused', () => {
    const clock = fakeClock()
    const engine = createTimerEngine({ segments: shortSession(), clock: clock.now })
    engine.start()
    engine.pause()

    const { snapshot } = engine.skipForward()
    expect(snapshot.status).toBe('paused')
    expect(snapshot.index).toBe(1)
    expect(snapshot.remainingMs).toBe(40_000)

    // And the new segment does not start bleeding time while still paused.
    clock.advance(60_000)
    expect(engine.tick().snapshot.remainingMs).toBe(40_000)
  })
})

describe('working time versus total elapsed', () => {
  it('separates them so a plate change does not count as training', () => {
    const clock = fakeClock()
    const engine = createTimerEngine({ segments: shortSession(), clock: clock.now })
    engine.start()

    clock.advance(60_000)
    engine.tick()
    engine.pause()
    clock.advance(300_000) // five minutes changing plates
    engine.resume()
    clock.advance(30_000)
    engine.tick()

    const snapshot = engine.snapshot()
    expect(snapshot.totalElapsedMs).toBe(390_000)
    expect(snapshot.workingTimeMs).toBe(90_000)
  })

  it('stops accruing working time during an in-progress pause', () => {
    const clock = fakeClock()
    const engine = createTimerEngine({ segments: shortSession(), clock: clock.now })
    engine.start()

    clock.advance(20_000)
    engine.pause()
    clock.advance(120_000)

    const snapshot = engine.snapshot()
    expect(snapshot.workingTimeMs).toBe(20_000)
    expect(snapshot.totalElapsedMs).toBe(140_000)
  })
})

describe('ending early', () => {
  it('stops the session and keeps what was completed', () => {
    const clock = fakeClock()
    const engine = createTimerEngine({ segments: shortSession(), clock: clock.now })
    engine.start()

    clock.advance(45_000)
    engine.tick()
    const { snapshot } = engine.end()
    expect(snapshot.status).toBe('complete')
    expect(snapshot.totalElapsedMs).toBe(45_000)

    clock.advance(60_000)
    expect(engine.tick().events).toHaveLength(0)
  })

  it('closes an open pause when ending', () => {
    const clock = fakeClock()
    const engine = createTimerEngine({ segments: shortSession(), clock: clock.now })
    engine.start()

    clock.advance(10_000)
    engine.pause()
    clock.advance(50_000)
    engine.end()

    expect(engine.snapshot().workingTimeMs).toBe(10_000)
    expect(engine.snapshot().totalElapsedMs).toBe(60_000)
  })
})

describe('persistable state', () => {
  it('captures what crash recovery needs', () => {
    const clock = fakeClock()
    const engine = createTimerEngine({ segments: shortSession(), clock: clock.now })
    engine.start()

    clock.advance(15_000)
    engine.tick()
    const state = engine.persistableState()

    expect(state.index).toBe(1)
    expect(state.isPaused).toBe(false)
    expect(state.durations).toHaveLength(4)
  })

  it('persists an extended rest so a restored session keeps it', () => {
    const clock = fakeClock()
    const engine = createTimerEngine({ segments: shortSession(), clock: clock.now })
    engine.start()

    clock.advance(55_000)
    engine.tick()
    engine.extend(30_000)

    // Without this the user would reopen the app and find their added rest gone.
    expect(engine.persistableState().durations[2]).toBe(50_000)
  })

  it('records the paused flag', () => {
    const clock = fakeClock()
    const engine = createTimerEngine({ segments: shortSession(), clock: clock.now })
    engine.start()
    engine.pause()
    expect(engine.persistableState().isPaused).toBe(true)
  })
})

describe('a full Session A run', () => {
  it('completes in exactly 14:30 of working time', () => {
    const clock = fakeClock()
    const segments = buildSegmentList(SESSION_A)
    const engine = createTimerEngine({ segments, clock: clock.now })
    engine.start()

    let ticks = 0
    while (engine.snapshot().status === 'running' && ticks < 20_000) {
      clock.advance(100)
      engine.tick()
      ticks += 1
    }

    expect(engine.snapshot().status).toBe('complete')
    expect(engine.snapshot().workingTimeMs).toBe(870_000) // 14:30
  })

  it('fires one halfway cue per single-arm row set and no more', () => {
    const clock = fakeClock()
    const segments = buildSegmentList(SESSION_A)
    const engine = createTimerEngine({ segments, clock: clock.now })
    engine.start()

    let halfways = 0
    for (let i = 0; i < 9_000 && engine.snapshot().status === 'running'; i += 1) {
      clock.advance(100)
      halfways += engine.tick().events.filter((e) => e.kind === 'halfway').length
    }

    // Three rounds of the row; the alternating lunge is in Session B.
    expect(halfways).toBe(3)
  })

  it('logs twelve work segments in order across three rounds', () => {
    const clock = fakeClock()
    const segments = buildSegmentList(SESSION_A)
    const engine = createTimerEngine({ segments, clock: clock.now })
    engine.start()

    const started: number[] = []
    for (let i = 0; i < 9_000 && engine.snapshot().status === 'running'; i += 1) {
      clock.advance(100)
      for (const event of engine.tick().events) {
        if (event.kind === 'segment-start' && segments[event.segmentIndex]?.type === 'work') {
          started.push(event.segmentIndex)
        }
      }
    }

    // The first work segment starts via start(), the other eleven via boundaries.
    expect(started.length).toBeGreaterThanOrEqual(11)
    expect([...started].sort((a, b) => a - b)).toEqual(started)
  })
})

describe('robustness', () => {
  it('does not announce a next exercise when the rest ends the session', () => {
    nextIndex = 0
    const segments = [seg('work', 10_000), seg('transition', 20_000)]
    const clock = fakeClock()
    const engine = createTimerEngine({ segments, clock: clock.now })
    engine.start()

    clock.advance(30_000)
    expect(kinds(engine.tick().events)).not.toContain('announce-next')
  })

  it('clamps a shortening extension at zero rather than going negative', () => {
    const clock = fakeClock()
    const engine = createTimerEngine({ segments: shortSession(), clock: clock.now })
    engine.start()

    clock.advance(55_000)
    engine.tick()
    engine.extend(-999_000)

    // The rest collapses and the session moves on, instead of a negative
    // duration cascading through the catch-up loop. The 5s already spent on
    // the rest spills into the finisher, because boundaries are always derived
    // arithmetically - the same rule that keeps backgrounding from drifting.
    const { snapshot } = engine.tick()
    expect(snapshot.index).toBe(3)
    expect(snapshot.remainingMs).toBe(25_000)
  })

  it('handles a zero-length segment without looping forever', () => {
    nextIndex = 0
    const segments = [seg('warmup', 0), seg('work', 10_000)]
    const clock = fakeClock()
    const engine = createTimerEngine({ segments, clock: clock.now })

    const { snapshot } = engine.start()
    expect(snapshot.index).toBe(1)
    expect(snapshot.remainingMs).toBe(10_000)
  })

  it('refuses to build a session with no segments', () => {
    expect(() => createTimerEngine({ segments: [] })).toThrow(/no segments/)
  })
})
