import { test, expect } from '@playwright/test'
import { openFrozen } from './helpers'

test('the player shows the movement for the current exercise', async ({ page }) => {
  await openFrozen(page, '/session/session-a', { leadIn: false })
  await expect(page.getByTestId('countdown')).toBeVisible()

  // Warm-up first, then the first circuit exercise.
  await expect(page.locator('svg.fig title')).toHaveText('Bodyweight squat')

  await page.clock.fastForward(95_000)
  await expect(page.getByRole('heading', { name: 'Goblet squat' })).toBeVisible()
  await expect(page.locator('svg.fig title')).toHaveText('Goblet squat')
})

test('the drawing follows a no-bench substitution', async ({ page }) => {
  await openFrozen(page, '/session/session-a', { leadIn: false, hasBench: false })
  await expect(page.getByTestId('countdown')).toBeVisible()

  await page.clock.fastForward(155_000) // into the second exercise of round one
  await expect(page.getByRole('heading', { name: 'Dumbbell floor press' })).toBeVisible()
  await expect(page.locator('svg.fig title')).toHaveText('Dumbbell floor press')
})

test('the animation stops when the session is paused', async ({ page }) => {
  await openFrozen(page, '/session/session-a', { leadIn: false })
  await expect(page.getByTestId('countdown')).toBeVisible()

  const figure = page.locator('svg.fig')
  await expect(figure).not.toHaveClass(/is-paused/)

  await page.getByRole('button', { name: 'Pause session' }).click()
  await expect(figure).toHaveClass(/is-paused/)

  // A paused figure must genuinely stop, not just carry a class.
  const state = await figure
    .locator('.torso, .body, .figure, .upperarm, .arm')
    .first()
    .evaluate((el) => getComputedStyle(el).animationPlayState)
  expect(state).toBe('paused')
})

test.describe('reduced motion', () => {
  test('freezes at the stretched pose and shows the start pose beside it', async ({ page }) => {
    // emulateMedia rather than a `reducedMotion` fixture, which this version
    // does not expose on test.use.
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await openFrozen(page, '/session/session-a', { leadIn: false })
    await expect(page.getByTestId('countdown')).toBeVisible()
    await page.clock.fastForward(95_000)

    const figure = page.locator('svg.fig')
    await expect(figure.locator('.ghost')).toBeVisible()
    await expect(figure.locator('.arrow')).toBeVisible()

    // Frozen deliberately, rather than left to the global reduced-motion reset,
    // which would collapse it onto the start frame instead of the stretch.
    const animation = await figure
      .locator('.torso')
      .evaluate((el) => getComputedStyle(el).animationName)
    expect(animation).toBe('none')
  })
})
