import { test, expect, type Page } from '@playwright/test'
import { openFrozen, seedSettings, ONBOARDED } from './helpers'

/**
 * The route component is lazy-loaded, so the app can still be mounting when
 * `goto` resolves. Every clock call depends on the runner's interval already
 * being registered - advancing a frozen clock before that leaves no timer to
 * fire, and it never fires afterwards either.
 */
async function openPlayer(page: Page, settings: Record<string, unknown> = {}) {
  await openFrozen(page, '/session/session-a', settings)
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

  await page.getByRole('button', { name: 'See summary' }).click()
  await expect(page).toHaveURL(/\/summary\//)
  await expect(page.getByRole('heading', { name: /Session A done/ })).toBeVisible()
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
  await seedSettings(page, ONBOARDED)
  await page.goto('/session/does-not-exist')
  await expect(page).toHaveURL(/\/$/)
})

test.describe('set logging', () => {
  /** Advances to the first rest, where the weight entry opens. */
  async function toFirstRest(page: Page) {
    await openPlayer(page, { leadIn: false })
    await page.clock.fastForward(130_000) // 90s warm-up + the 40s work interval
    await expect(banner(page)).toHaveText('Rest')
  }

  test('the weight entry opens during the rest, beside a running countdown', async ({ page }) => {
    await toFirstRest(page)

    await expect(page.getByRole('region', { name: 'Log your set' })).toBeVisible()
    await expect(page.getByText('Goblet squat · round 1')).toBeVisible()
    await expect(countdown(page)).toHaveText('20')
  })

  test('a first-ever set shows the calibration banner and the floor weight', async ({ page }) => {
    await toFirstRest(page)

    await expect(page.getByText(/Pick a weight where the last two reps are hard/)).toBeVisible()
    await expect(page.getByRole('button', { name: /^Weight 5 kg/ })).toBeVisible()
  })

  test('the stepper adjusts weight without a keyboard', async ({ page }) => {
    await toFirstRest(page)

    await page.getByRole('button', { name: 'Increase weight' }).click()
    await expect(page.getByRole('button', { name: /^Weight 7.5 kg/ })).toBeVisible()

    await page.getByRole('button', { name: 'Decrease weight' }).click()
    await expect(page.getByRole('button', { name: /^Weight 5 kg/ })).toBeVisible()
  })

  test('reps default to the target and can be adjusted down', async ({ page }) => {
    await toFirstRest(page)

    await expect(page.getByTestId('reps')).toHaveText('12')
    await page.getByRole('button', { name: 'Decrease reps' }).click()
    await expect(page.getByTestId('reps')).toHaveText('11')
  })

  test('tapping the number opens a numeric entry', async ({ page }) => {
    await toFirstRest(page)

    await page.getByRole('button', { name: /^Weight 5 kg/ }).click()
    const field = page.getByRole('textbox', { name: 'Weight' })
    await expect(field).toHaveAttribute('inputmode', 'decimal')

    await field.fill('24')
    await field.press('Enter')
    await expect(page.getByRole('button', { name: /^Weight 24 kg/ })).toBeVisible()
  })

  test('Next commits the set and moves straight on', async ({ page }) => {
    await toFirstRest(page)

    await page.getByRole('button', { name: 'Increase weight' }).click()
    await page.getByRole('button', { name: 'Next', exact: true }).click()

    await expect(banner(page)).toHaveText('Work')
    await expect(page.getByRole('heading', { name: 'Flat dumbbell bench press' })).toBeVisible()
  })

  test('pausing mid-rest keeps the entry open and editable', async ({ page }) => {
    await toFirstRest(page)
    await page.getByRole('button', { name: 'Pause session' }).click()

    // This is the plate-change case: the entry must not commit itself away.
    await page.clock.fastForward(600_000)
    await expect(page.getByRole('region', { name: 'Log your set' })).toBeVisible()

    await page.getByRole('button', { name: 'Increase weight' }).click()
    await expect(page.getByRole('button', { name: /^Weight 7.5 kg/ })).toBeVisible()
    await expect(countdown(page)).toHaveText('20')
  })

  test('a completed session reports its sets and volume', async ({ page }) => {
    await openPlayer(page, { leadIn: false })
    await page.clock.fastForward(870_000)

    await expect(page.getByRole('heading', { name: 'Session complete' })).toBeVisible()
    // Twelve sets at the 5 kg floor, reps defaulting to the top of each range.
    await expect(page.getByTestId('completed-volume')).toContainText('12 sets')
  })
})
