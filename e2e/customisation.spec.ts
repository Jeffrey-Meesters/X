import { test, expect } from '@playwright/test'
import { seedSettings, ONBOARDED, openFrozen, T0, FROZEN_AT } from './helpers'

/**
 * Customisation (spec section 3.6) and the theme (section 12).
 *
 * The through-line of these tests: a change made in Settings has to reach the
 * session the user actually runs. Settings that only change Settings is the
 * failure mode worth guarding against.
 */

test.describe('session shape', () => {
  test('changing the work interval changes the planned session length', async ({ page }) => {
    await seedSettings(page, ONBOARDED)
    await page.goto('/settings')

    await expect(page.getByTestId('planned-lengths')).toContainText('14:30')

    // 4 exercises x 3 rounds x 5 s = 1:00 added.
    await page.getByTestId('workSec-up').click()
    await expect(page.getByTestId('workSec-value')).toHaveText('45s')
    await expect(page.getByTestId('planned-lengths')).toContainText('15:30')

    await page.goto('/')
    await expect(page.getByText('15:30 planned')).toBeVisible()
  })

  test('an added round reaches the player', async ({ page }) => {
    await seedSettings(page, { ...ONBOARDED, leadIn: false })
    await page.goto('/settings')
    await page.getByTestId('rounds-up').click()
    await expect(page.getByTestId('rounds-value')).toHaveText('4')

    // Frozen before navigating, so the player is still on segment zero when
    // the fast-forward starts (see the note in the README on page.clock).
    await page.clock.install({ time: T0 })
    await page.clock.pauseAt(FROZEN_AT)
    await page.goto('/session/session-a')
    await expect(page.getByTestId('countdown')).toBeVisible()

    // Past the 90-second warm-up: the round indicator only exists on circuit
    // segments, so asserting at segment zero would find nothing.
    await page.clock.fastForward(95_000)
    await expect(page.getByTestId('round')).toContainText('of 4')
  })

  test('the steppers stop at their limits rather than running away', async ({ page }) => {
    await seedSettings(page, { ...ONBOARDED, rounds: 2 })
    await page.goto('/settings')
    await expect(page.getByTestId('rounds-down')).toBeDisabled()
    await expect(page.getByTestId('rounds-up')).toBeEnabled()
  })

  test('reset restores the default program', async ({ page }) => {
    await seedSettings(page, { ...ONBOARDED, workSec: 60, rounds: 5 })
    await page.goto('/settings')
    await expect(page.getByTestId('planned-lengths')).not.toContainText('14:30')

    await page.getByTestId('reset-shape').click()
    await expect(page.getByTestId('planned-lengths')).toContainText('14:30')
    await expect(page.getByTestId('reset-shape')).toBeHidden()
  })
})

test.describe('exercise swaps', () => {
  test('a swapped exercise is what the home screen promises', async ({ page }) => {
    await seedSettings(page, ONBOARDED)
    await page.goto('/settings')

    await page.getByTestId('swap-goblet-squat').selectOption('split-squat')
    await page.goto('/')

    await expect(page.getByText('Split squat')).toBeVisible()
    await expect(page.getByText('Goblet squat')).toBeHidden()
  })

  test('does not offer bench movements to someone without a bench', async ({ page }) => {
    await seedSettings(page, { ...ONBOARDED, hasBench: false })
    await page.goto('/settings')

    const options = page.getByTestId('swap-db-bench-press').locator('option')
    await expect(options).toHaveText(['Dumbbell floor press'])
  })

  test('an explicit choice survives the equipment substitution', async ({ page }) => {
    await seedSettings(page, { ...ONBOARDED, hasBench: false })
    await page.goto('/settings')

    await page.getByTestId('swap-db-chest-fly').selectOption('db-squeeze-press')
    await page.goto('/')
    await page.getByTestId('switch-session').click()

    await expect(page.getByText('Dumbbell squeeze press')).toBeVisible()
  })
})

test.describe('the fourth shoulder set', () => {
  test('trades Session B’s finisher without changing its length', async ({ page }) => {
    await seedSettings(page, ONBOARDED)
    await page.goto('/settings')

    await page.getByTestId('extra-shoulder-set').check()
    // Spec section 2 offers this as an option that does not cost session time.
    await expect(page.getByTestId('planned-lengths')).toContainText('14:30')

    await page.goto('/')
    await page.getByTestId('switch-session').click()
    await expect(page.getByText('14:30 planned')).toBeVisible()
  })
})

test.describe('session rotation', () => {
  test('offers Session A first, and the other one on request', async ({ page }) => {
    await seedSettings(page, ONBOARDED)
    await page.goto('/')

    await expect(page.getByRole('button', { name: /Start Session A/ })).toBeVisible()
    await page.getByTestId('switch-session').click()
    await expect(page.getByRole('button', { name: /Start Session B/ })).toBeVisible()
  })

  test('offers Session B after Session A has been completed', async ({ page }) => {
    await openFrozen(page, '/session/session-a', { leadIn: false })
    await expect(page.getByTestId('countdown')).toBeVisible()
    await page.clock.fastForward(880_000)
    await page.getByRole('button', { name: 'See summary' }).click()
    await expect(page).toHaveURL(/\/summary\//)

    await page.goto('/')
    await expect(page.getByRole('button', { name: /Start Session B/ })).toBeVisible()
  })
})

test.describe('theme', () => {
  test('switches the document between light and dark', async ({ page }) => {
    await seedSettings(page, ONBOARDED)
    await page.goto('/settings')

    await page.getByTestId('theme-light').click()
    await expect(page.locator('html')).toHaveClass(/light/)
    await expect(page.locator('html')).not.toHaveClass(/dark/)

    await page.getByTestId('theme-dark').click()
    await expect(page.locator('html')).toHaveClass(/dark/)
  })

  test('applies the stored theme before the app paints', async ({ page }) => {
    // Not just eventually: the document ships as `class="dark"`, and a repaint
    // on every cold start is exactly what this is meant to prevent.
    await seedSettings(page, { ...ONBOARDED, theme: 'light' })
    await page.goto('/')
    await expect(page.locator('html')).toHaveClass(/light/)
  })
})
