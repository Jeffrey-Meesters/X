import { test, expect, type Page } from '@playwright/test'

const T0 = new Date('2026-08-29T09:00:00Z')
const FROZEN_AT = new Date(T0.getTime() + 60_000)

async function open(page: Page, path: string, settings: Record<string, unknown> = {}) {
  await page.clock.install({ time: T0 })
  await page.clock.pauseAt(FROZEN_AT)
  await page.addInitScript((value) => {
    localStorage.setItem('fullbody15.settings', JSON.stringify(value))
  }, settings)
  await page.goto(path)
}

test('an interrupted session is offered back after a reload', async ({ page }) => {
  await open(page, '/session/session-a', { leadIn: false })
  await expect(page.getByTestId('countdown')).toBeVisible()

  // Get into the first set, log a weight, then land in the rest.
  await page.clock.fastForward(130_000)
  await expect(page.getByRole('region', { name: 'Log your set' })).toBeVisible()
  await page.getByRole('button', { name: 'Increase weight' }).click()

  // Simulate the tab being evicted or the browser closed mid-session.
  await page.goto('/')

  await expect(page.getByRole('heading', { name: /Unfinished Session A/ })).toBeVisible()
  await expect(page.getByText('It will come back paused.')).toBeVisible()
})

test('resuming comes back paused, at the same point', async ({ page }) => {
  await open(page, '/session/session-a', { leadIn: false })
  await expect(page.getByTestId('countdown')).toBeVisible()
  await page.clock.fastForward(105_000) // 15s into the first work interval
  await expect(page.getByTestId('countdown')).toHaveText('25')

  await page.goto('/')
  await page.getByRole('button', { name: 'Resume' }).click()

  await expect(page.getByTestId('segment-label')).toHaveText('Paused')
  await expect(page.getByTestId('countdown')).toHaveText('25')

  // Genuinely paused: time passing must not move it.
  await page.clock.fastForward(120_000)
  await expect(page.getByTestId('countdown')).toHaveText('25')

  await page.getByRole('button', { name: 'Resume session' }).click()
  await page.clock.fastForward(5_000)
  await expect(page.getByTestId('countdown')).toHaveText('20')
})

test('discarding removes the prompt and does not offer it again', async ({ page }) => {
  await open(page, '/session/session-a', { leadIn: false })
  await expect(page.getByTestId('countdown')).toBeVisible()
  await page.clock.fastForward(130_000)

  await page.goto('/')
  await page.getByRole('button', { name: 'Discard' }).click()
  await expect(page.getByRole('heading', { name: /Unfinished/ })).toBeHidden()

  await page.goto('/')
  await expect(page.getByRole('heading', { name: /Unfinished/ })).toBeHidden()
})

test('a completed session leaves nothing to recover', async ({ page }) => {
  await open(page, '/session/session-a', { leadIn: false })
  await expect(page.getByTestId('countdown')).toBeVisible()
  await page.clock.fastForward(870_000)
  await expect(page.getByRole('heading', { name: 'Session complete' })).toBeVisible()

  await page.goto('/')
  await expect(page.getByRole('heading', { name: /Unfinished/ })).toBeHidden()
})

test('history survives a reload and pre-fills the next session', async ({ page }) => {
  await open(page, '/session/session-a', { leadIn: false })
  await expect(page.getByTestId('countdown')).toBeVisible()

  // Run a full session, setting a real weight on the first set.
  await page.clock.fastForward(130_000)
  await page.getByRole('button', { name: /^Weight 5 kg/ }).click()
  const field = page.getByRole('textbox', { name: 'Weight' })
  await field.fill('27.5')
  await field.press('Enter')
  await page.clock.fastForward(870_000)
  await expect(page.getByRole('heading', { name: 'Session complete' })).toBeVisible()

  // A fresh visit should open the first goblet squat entry on that weight
  // rather than falling back to the calibration floor.
  await page.goto('/session/session-a')
  await expect(page.getByTestId('countdown')).toBeVisible()
  await page.clock.fastForward(130_000)

  await expect(page.getByRole('button', { name: /^Weight 27.5 kg/ })).toBeVisible()
  await expect(page.getByText(/Pick a weight where/)).toBeHidden()
})
