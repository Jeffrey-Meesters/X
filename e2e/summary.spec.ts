import { test, expect, type Page } from '@playwright/test'
import { openFrozen } from './helpers'

async function enterWeight(page: Page, value: string) {
  await page.getByRole('button', { name: /^Weight/ }).click()
  const field = page.getByRole('textbox', { name: 'Weight' })
  await field.fill(value)
  await field.press('Enter')
}

/**
 * Runs a full session, confirming the goblet squat on all three rounds.
 *
 * All three matters: clearing the range requires every round to be confirmed,
 * so entering a weight on round one alone earns no nudge - which is the whole
 * point of the confirmation rule.
 *
 * Goblet squat rests fall at 130s, 370s and 610s: a 90s warm-up, then a
 * four-exercise round of 40s work plus 20s rest each.
 */
async function completeSession(page: Page, weight = '30') {
  await openFrozen(page, '/session/session-a', { leadIn: false })
  await expect(page.getByTestId('countdown')).toBeVisible()

  await page.clock.fastForward(135_000)
  await enterWeight(page, weight)
  await page.clock.fastForward(240_000)
  await enterWeight(page, weight)
  await page.clock.fastForward(240_000)
  await enterWeight(page, weight)

  await page.clock.fastForward(255_000)
  await page.getByRole('button', { name: 'See summary' }).click()
  await expect(page).toHaveURL(/\/summary\//)
}

test('the summary reports time, sets and volume', async ({ page }) => {
  await completeSession(page)

  await expect(page.getByRole('heading', { name: /Session A done/ })).toBeVisible()
  await expect(page.getByText('Working time')).toBeVisible()
  await expect(page.getByText('14:30', { exact: false })).toBeVisible()
  await expect(page.getByText('Volume')).toBeVisible()
  await expect(page.getByText('weight × reps')).toBeVisible()
})

test('a progression nudge offers both choices at equal weight', async ({ page }) => {
  await completeSession(page)

  // All three rounds were confirmed at the top of the rep range.
  const nudge = page.getByText(/Try/).first()
  await expect(nudge).toBeVisible()

  // Declining must be exactly as easy as accepting (spec section 10).
  await expect(page.getByRole('button', { name: 'Not this time' })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Use / })).toBeVisible()
})

test('declining keeps the current weight and says so', async ({ page }) => {
  await completeSession(page)

  await page.getByRole('button', { name: 'Not this time' }).first().click()
  await expect(page.getByText(/Staying at/).first()).toBeVisible()
})

test('accepting a nudge pre-fills the next session at the new weight', async ({ page }) => {
  await completeSession(page, '30')
  await page.getByRole('button', { name: /^Use 32.5/ }).first().click()
  await expect(page.getByText(/Next session starts at 32.5/).first()).toBeVisible()

  // The whole point of accepting: the next session opens on the new weight.
  await openFrozen(page, '/session/session-a', { leadIn: false })
  await expect(page.getByTestId('countdown')).toBeVisible()
  await page.clock.fastForward(130_000)
  await expect(page.getByRole('button', { name: /^Weight 32.5 kg/ })).toBeVisible()
})

test('history shows the session, charts and per-exercise detail', async ({ page }) => {
  await completeSession(page)
  await page.getByRole('link', { name: 'History' }).click()

  await expect(page.getByRole('heading', { name: 'History' })).toBeVisible()
  await expect(page.getByText('Sets per muscle group')).toBeVisible()
  // With a single week there is nothing to compare, so the volume is a number
  // rather than a one-bar bar chart.
  await expect(page.getByText('Volume this week')).toBeVisible()
  await expect(page.getByText(/a trend appears once/)).toBeVisible()
  await expect(page.getByText(/Top set/)).toBeVisible()
  await expect(page.getByText('Best set')).toBeVisible()
  await expect(page.getByText('Est. 1RM')).toBeVisible()
})

test('every chart value is readable without hovering', async ({ page }) => {
  await completeSession(page)
  await page.goto('/history')

  // A tooltip is never the only way to read a value.
  const values = page.getByRole('group').filter({ hasText: 'Show values' }).first()
  await values.getByText('Show values').click()
  await expect(values.getByRole('table')).toBeVisible()
})

test('the exercise picker shows the exercise being charted', async ({ page }) => {
  await completeSession(page)
  await page.goto('/history')

  // The picker used to render blank while the chart below showed a fallback.
  await expect(page.getByLabel('Choose an exercise')).toHaveValue('goblet-squat')
})

test('history is empty and says so before anything is logged', async ({ page }) => {
  await openFrozen(page, '/history')
  await expect(page.getByText(/Nothing logged yet/)).toBeVisible()
})
