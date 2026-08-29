import { test, expect, type Page } from '@playwright/test'

/** Fixed start time so every assertion below is deterministic. */
const T0 = new Date('2026-08-29T09:00:00Z')
/**
 * `install()` leaves the clock ticking, and `pauseAt()` is a second round trip,
 * so by the time it lands the fake clock has already moved past T0. Pausing at
 * an instant comfortably in the future removes that race. Nothing is loaded
 * yet, so no application timer fires while crossing the gap.
 */
const FROZEN_AT = new Date(T0.getTime() + 60_000)

/**
 * `page.clock` fast-forwards the browser's own clock, so a full 14:30 session
 * runs in milliseconds rather than a quarter of an hour.
 *
 * `install()` alone is not enough: it fakes the clock but leaves it ticking at
 * real time, which makes every countdown assertion a race. `pauseAt()` freezes
 * it, and it has to happen before navigation so the page is frozen from its
 * very first paint.
 */
async function openPlayer(page: Page, settings: Record<string, unknown> = {}) {
  await page.clock.install({ time: T0 })
  await page.clock.pauseAt(FROZEN_AT)
  await page.addInitScript((value) => {
    localStorage.setItem('fullbody15.settings', JSON.stringify(value))
  }, settings)
  await page.goto('/session/session-a')

  // The route component is lazy-loaded, so the app can still be mounting when
  // `goto` resolves. Every clock call below depends on the runner's interval
  // already being registered - advancing a frozen clock before that leaves no
  // timer to fire, and it never fires afterwards either.
  await expect(page.getByTestId('countdown')).toBeVisible()
}

const countdown = (page: Page) => page.getByTestId('countdown')
const banner = (page: Page) => page.getByTestId('segment-label')

test('opens on the warm-up with a full countdown', async ({ page }) => {
  await openPlayer(page, { leadIn: false })

  await expect(page.getByRole('heading', { name: 'Bodyweight squat' })).toBeVisible()
  await expect(banner(page)).toHaveText('Warm-up')
  await expect(countdown(page)).toHaveText('30')
})

test('shows the lead-in when enabled', async ({ page }) => {
  await openPlayer(page, { leadIn: true })
  await expect(banner(page)).toHaveText('Get ready')
  await expect(countdown(page)).toHaveText('5')
})

test('the countdown ticks continuously while running', async ({ page }) => {
  await openPlayer(page, { leadIn: false })

  // runFor fires every intervening 100ms interval, so this exercises the real
  // display loop rather than a single catch-up. Kept deliberately short: the
  // fine-grained arithmetic is covered exhaustively by the engine unit tests.
  await expect(countdown(page)).toHaveText('30')
  await page.clock.runFor(1_000)
  await expect(countdown(page)).toHaveText('29')
  await page.clock.runFor(2_000)
  await expect(countdown(page)).toHaveText('27')
})

test('counts down and advances into the circuit', async ({ page }) => {
  await openPlayer(page, { leadIn: false })

  await page.clock.fastForward(10_000)
  await expect(countdown(page)).toHaveText('20')

  await page.clock.fastForward(80_000) // finish the 90s warm-up, into the first set
  await expect(page.getByRole('heading', { name: 'Goblet squat' })).toBeVisible()
  await expect(banner(page)).toHaveText('Work')
  await expect(page.getByTestId('round')).toHaveText('Round 1 of 3')
  await expect(page.getByTestId('target')).toHaveText('8–12 reps')
})

test('pause freezes the countdown and resume continues from there', async ({ page }) => {
  await openPlayer(page, { leadIn: false })

  await page.clock.fastForward(10_000)
  await expect(countdown(page)).toHaveText('20')

  await page.getByRole('button', { name: 'Pause session' }).click()
  await expect(banner(page)).toHaveText('Paused')

  // A plate change can take minutes; the countdown must not move at all.
  await page.clock.fastForward(300_000)
  await expect(countdown(page)).toHaveText('20')

  await page.getByRole('button', { name: 'Resume session' }).click()
  await page.clock.fastForward(5_000)
  await expect(countdown(page)).toHaveText('15')
})

test('rest offers extensions and work does not', async ({ page }) => {
  await openPlayer(page, { leadIn: false })

  await expect(page.getByRole('button', { name: '+15s' })).toBeHidden()

  await page.clock.fastForward(130_000) // warm-up plus the first work interval
  await expect(banner(page)).toHaveText('Rest')
  await expect(page.getByTestId('next-up')).toHaveText('Next: Flat dumbbell bench press')

  await expect(countdown(page)).toHaveText('20')
  await page.getByRole('button', { name: '+15s' }).click()
  await expect(countdown(page)).toHaveText('35')
})

test('skip jumps a whole segment', async ({ page }) => {
  await openPlayer(page, { leadIn: false })

  await page.getByRole('button', { name: 'Next segment' }).click()
  await expect(page.getByRole('heading', { name: 'Hip hinge' })).toBeVisible()
  await expect(countdown(page)).toHaveText('30')

  await page.getByRole('button', { name: 'Previous segment' }).click()
  await expect(page.getByRole('heading', { name: 'Bodyweight squat' })).toBeVisible()
})

test('form cues are available behind a tap', async ({ page }) => {
  await openPlayer(page, { leadIn: false })
  await page.clock.fastForward(90_000)

  const toggle = page.getByRole('button', { name: /Form cues/ })
  await toggle.click()
  await expect(page.getByText('Elbows inside the knees')).toBeVisible()
  await expect(page.getByText('Heels lifting')).toBeVisible()
})

test('runs a whole session through to completion', async ({ page }) => {
  await openPlayer(page, { leadIn: false })

  // Each timer fires at most once, so this doubles as a test of the
  // backgrounding catch-up path: the phone slept through the whole session.
  await page.clock.fastForward(870_000)
  await expect(page.getByRole('heading', { name: 'Session complete' })).toBeVisible()
  await expect(page.getByTestId('completed-label')).toHaveText('14:30 of work')

  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page).toHaveURL(/\/$/)
})

test('a paused session reports work and elapsed time separately', async ({ page }) => {
  await openPlayer(page, { leadIn: false })

  await page.clock.fastForward(60_000)
  await page.getByRole('button', { name: 'Pause session' }).click()
  await page.clock.fastForward(120_000) // two minutes changing plates
  await page.getByRole('button', { name: 'Resume session' }).click()
  await page.clock.fastForward(810_000)

  await expect(page.getByRole('heading', { name: 'Session complete' })).toBeVisible()
  // Real elapsed time exceeds the nominal 14:30 because pause doubles as the
  // plate-change mechanism (spec section 6.5).
  await expect(page.getByTestId('completed-label')).toHaveText('14:30 of work, 16:30 elapsed')
})

test('an unknown session id falls back to home', async ({ page }) => {
  await page.goto('/session/does-not-exist')
  await expect(page).toHaveURL(/\/$/)
})
