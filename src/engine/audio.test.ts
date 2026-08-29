import { describe, it, expect, vi } from 'vitest'
import { createAudioCuePlayer, cueForEvent, CUES, type CueName } from './audio'

/** Minimal AudioContext stand-in that records what was scheduled. */
function fakeContext() {
  const started: { freq: number; start: number; stop: number }[] = []
  let state: AudioContextState = 'suspended'

  const context = {
    currentTime: 0,
    get state() {
      return state
    },
    resume: vi.fn(async () => {
      state = 'running'
    }),
    close: vi.fn(async () => {
      state = 'closed'
    }),
    destination: {},
    createOscillator() {
      const node = {
        type: 'sine' as OscillatorType,
        frequency: { value: 0 },
        connect: vi.fn(),
        start: vi.fn((at: number) => {
          started.push({ freq: node.frequency.value, start: at, stop: 0 })
        }),
        stop: vi.fn((at: number) => {
          const last = started[started.length - 1]
          if (last) last.stop = at
        }),
      }
      return node
    },
    createGain() {
      return {
        gain: {
          setValueAtTime: vi.fn(),
          linearRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
      }
    },
  }

  return { context: context as unknown as AudioContext, started }
}

describe('audio cue player', () => {
  it('does not create a context until unlocked', async () => {
    const createContext = vi.fn(() => fakeContext().context)
    const player = createAudioCuePlayer({ createContext })

    // Constructing one at page load would leave it suspended on iOS.
    expect(createContext).not.toHaveBeenCalled()
    expect(player.unlocked).toBe(false)

    await player.unlock()
    expect(createContext).toHaveBeenCalledTimes(1)
    expect(player.unlocked).toBe(true)
  })

  it('resumes a suspended context on unlock', async () => {
    const { context } = fakeContext()
    const player = createAudioCuePlayer({ createContext: () => context })

    await player.unlock()
    expect(context.resume).toHaveBeenCalled()
  })

  it('only unlocks once however often it is called', async () => {
    const createContext = vi.fn(() => fakeContext().context)
    const player = createAudioCuePlayer({ createContext })

    await player.unlock()
    await player.unlock()
    await player.unlock()
    expect(createContext).toHaveBeenCalledTimes(1)
  })

  it('stays silent before it is unlocked', () => {
    const { context, started } = fakeContext()
    const player = createAudioCuePlayer({ createContext: () => context })

    player.play('work-start')
    expect(started).toHaveLength(0)
  })

  it('plays a tone once unlocked', async () => {
    const { context, started } = fakeContext()
    const player = createAudioCuePlayer({ createContext: () => context })

    await player.unlock()
    player.play('work-start')

    expect(started).toHaveLength(1)
    expect(started[0]?.freq).toBe(880)
  })

  it('schedules every note of a multi-note cue in order', async () => {
    const { context, started } = fakeContext()
    const player = createAudioCuePlayer({ createContext: () => context })

    await player.unlock()
    player.play('complete')

    expect(started).toHaveLength(3)
    // A rising third: the only cue that resolves upward.
    expect(started.map((n) => n.freq)).toEqual([523.25, 659.25, 783.99])
    expect(started[0]!.start).toBeLessThan(started[1]!.start)
    expect(started[1]!.start).toBeLessThan(started[2]!.start)
  })

  it('gives the halfway cue a distinct double-blip shape', async () => {
    const { context, started } = fakeContext()
    const player = createAudioCuePlayer({ createContext: () => context })

    await player.unlock()
    player.play('halfway')

    expect(started).toHaveLength(2)
    expect(started[0]?.freq).toBe(started[1]?.freq)
  })

  it('distinguishes work start from work end by pitch, not volume', () => {
    const start = CUES['work-start'][0]!
    const end = CUES['work-end'][0]!
    expect(start.freq).toBeGreaterThan(end.freq)
  })

  it('degrades to a no-op where Web Audio is unavailable', async () => {
    const player = createAudioCuePlayer({ createContext: () => undefined })

    await player.unlock()
    expect(player.available).toBe(false)
    expect(player.unlocked).toBe(false)
    expect(() => player.play('work-start')).not.toThrow()
  })

  it('survives a context that throws on construction', async () => {
    const player = createAudioCuePlayer({
      createContext: () => {
        throw new Error('blocked')
      },
    })

    await player.unlock()
    expect(player.available).toBe(false)
    expect(() => player.play('complete')).not.toThrow()
  })

  it('closes the context on dispose', async () => {
    const { context } = fakeContext()
    const player = createAudioCuePlayer({ createContext: () => context })

    await player.unlock()
    player.dispose()

    expect(context.close).toHaveBeenCalled()
    expect(player.unlocked).toBe(false)
  })

  it('has a defined tone for every cue name', () => {
    const names: CueName[] = ['countdown', 'work-start', 'work-end', 'halfway', 'complete']
    for (const name of names) {
      expect(CUES[name].length).toBeGreaterThan(0)
      for (const note of CUES[name]) expect(note.freq).toBeGreaterThan(0)
    }
  })
})

describe('event to cue mapping', () => {
  it('sounds the go tone when a work interval starts', () => {
    expect(cueForEvent('segment-start', 'work')).toBe('work-start')
  })

  it('sounds the stop tone when a rest starts', () => {
    expect(cueForEvent('segment-start', 'transition')).toBe('work-end')
  })

  it('treats warm-ups and finishers as work', () => {
    // They are intervals the user has to move for, so silence would be wrong.
    expect(cueForEvent('segment-start', 'warmup')).toBe('work-start')
    expect(cueForEvent('segment-start', 'finisher')).toBe('work-start')
  })

  it('maps the point cues', () => {
    expect(cueForEvent('countdown', 'lead-in')).toBe('countdown')
    expect(cueForEvent('halfway', 'work')).toBe('halfway')
    expect(cueForEvent('complete', 'finisher')).toBe('complete')
  })

  it('stays silent for events with no sound of their own', () => {
    // segment-end always pairs with the next segment-start, so sounding both
    // would double every transition.
    expect(cueForEvent('segment-end', 'work')).toBeUndefined()
    expect(cueForEvent('announce-next', 'transition')).toBeUndefined()
  })
})
