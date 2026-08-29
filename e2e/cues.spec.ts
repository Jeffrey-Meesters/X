import { test, expect, type Page } from '@playwright/test'
import { T0, FROZEN_AT, seedSettings, ONBOARDED } from './helpers'

/**
 * Records what the page tries to play or buzz.
 *
 * Stubbing AudioContext is the only way to assert on cues from the outside;
 * a real one produces sound nothing can observe.
 */
async function instrument(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as {
      __tones: number[]
      __vibrations: unknown[]
      AudioContext: unknown
    }
    w.__tones = []
    w.__vibrations = []

    class FakeAudioContext {
      currentTime = 0
      state = 'suspended'
      destination = {}
      async resume() {
        this.state = 'running'
      }
      async close() {
        this.state = 'closed'
      }
      createGain() {
        return {
          gain: { setValueAtTime() {}, linearRampToValueAtTime() {} },
          connect() {},
        }
      }
      createOscillator() {
        const node = {
          type: 'sine',
          frequency: { value: 0 },
          connect() {},
          start() {
            w.__tones.push(node.frequency.value)
          },
          stop() {},
        }
        return node
      }
    }
    w.AudioContext = FakeAudioContext

    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      value: (pattern: unknown) => {
        w.__vibrations.push(pattern)
        return true
      },
    })
  })
}

const tones = (page: Page) => page.evaluate(() => (window as unknown as { __tones: number[] }).__tones)
const vibrations = (page: Page) =>
  page.evaluate(() => (window as unknown as { __vibrations: unknown[] }).__vibrations)

/** Jumps whole segments, which is far cheaper than ticking through them. */
async function skipSegments(page: Page, count: number): Promise<void> {
  for (let i = 0; i < count; i += 1) {
    await page.getByRole('button', { name: 'Next segment' }).click()
  }
}

/** Goes through the home screen so the Start tap unlocks audio, as on a phone. */
async function startFromHome(page: Page, settings: Record<string, unknown> = {}) {
  await instrument(page)
  await page.clock.install({ time: T0 })
  await page.clock.pauseAt(FROZEN_AT)
  await seedSettings(page, { ...ONBOARDED, leadIn: false, ...settings })
  await page.goto('/')
  await page.getByRole('button', { name: /Start Session A/ }).click()
  await expect(page.getByTestId('countdown')).toBeVisible()
}

test('the Start tap unlocks audio and the first interval sounds', async ({ page }) => {
  await startFromHome(page)

  // 880Hz is the work-start tone; the warm-up counts as work.
  await expect.poll(() => tones(page)).toContain(880)
})

test('a rest sounds different from a work interval', async ({ page }) => {
  await startFromHome(page)
  // Skip the three warm-up segments rather than ticking through 90s of them.
  await skipSegments(page, 3)
  await page.clock.runFor(40_000) // let the work interval end naturally

  const played = await tones(page)
  expect(played).toContain(880) // work start
  expect(played).toContain(440) // rest start
})

test('a unilateral set gets its halfway switch cue', async ({ page }) => {
  await startFromHome(page)

  // The single-arm row is segment 7: three warm-ups, then two work-and-rest
  // pairs. Skipping there keeps the test to one real interval.
  await skipSegments(page, 7)
  await expect(page.getByRole('heading', { name: 'Single-arm dumbbell row' })).toBeVisible()

  // The switch cue lands at the midpoint of the 40s interval.
  await page.clock.runFor(20_100)
  await expect.poll(() => tones(page)).toContain(990)
})

test('returning to a hidden tab does not replay the cues it missed', async ({ page }) => {
  await startFromHome(page)
  const before = (await tones(page)).length

  // fastForward fires each timer at most once, which is what a slept phone
  // looks like: the engine catches up through many segments in a single tick.
  await page.clock.fastForward(600_000)

  const after = (await tones(page)).length
  // Ten minutes of intervals elapsed. Without the missed flag this would be a
  // burst of a dozen beeps the moment the screen came back (spec section 6.3).
  expect(after - before).toBeLessThanOrEqual(1)
})

test('cues stop when sound is switched off', async ({ page }) => {
  await startFromHome(page, { audioCues: false })
  await skipSegments(page, 3)
  await page.clock.runFor(1_000)

  expect(await tones(page)).toHaveLength(0)
})

test('haptics fire at interval changes', async ({ page }) => {
  await startFromHome(page)
  await skipSegments(page, 1)
  await expect.poll(() => vibrations(page)).not.toHaveLength(0)
})

test('haptics stop when vibration is switched off', async ({ page }) => {
  await startFromHome(page, { haptics: false })
  await skipSegments(page, 3)
  expect(await vibrations(page)).toHaveLength(0)
})

test('pausing silences the cues', async ({ page }) => {
  await startFromHome(page)
  await page.getByRole('button', { name: 'Pause session' }).click()
  const before = (await tones(page)).length

  // Paused means no events at all, so nothing can sound however long it lasts.
  await page.clock.fastForward(300_000)
  expect((await tones(page)).length).toBe(before)
})

test('every cue channel is individually toggleable in settings', async ({ page }) => {
  await seedSettings(page, ONBOARDED)
  await page.goto('/settings')

  for (const label of ['Sound cues', 'Voice announcements', 'Vibration', 'Keep screen awake']) {
    await expect(page.getByLabel(label)).toBeChecked()
    await page.getByLabel(label).uncheck()
  }

  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('fullbody15.settings') ?? '{}')))
    .toMatchObject({
      audioCues: false,
      voiceAnnouncements: false,
      haptics: false,
      keepScreenAwake: false,
    })
})
