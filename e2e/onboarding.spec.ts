import { test, expect } from '@playwright/test'
import { seedSettings, ONBOARDED } from './helpers'

const settingsJson = (page: import('@playwright/test').Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('fullbody15.settings') ?? '{}'))

test('a first run lands on onboarding, whatever was asked for', async ({ page }) => {
  await page.goto('/history')
  await expect(page).toHaveURL(/\/onboarding$/)
  await expect(page.getByRole('heading', { name: 'Kilograms or pounds?' })).toBeVisible()
})

test('asks three questions then the acknowledgement', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Step 1 of 4')).toBeVisible()

  await page.getByRole('button', { name: 'Kilograms (kg)' }).click()
  await expect(page.getByRole('heading', { name: 'Do you have a bench?' })).toBeVisible()

  await page.getByRole('button', { name: 'Yes', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Smallest weight you can add?' })).toBeVisible()

  await page.getByRole('button', { name: '2.5 kg' }).click()
  await expect(page.getByRole('heading', { name: 'Before you start' })).toBeVisible()
})

test('never asks for anything it does not use', async ({ page }) => {
  await page.goto('/')
  // Age, sex, bodyweight, experience and goals change nothing in v1, so
  // collecting them would be friction with no payoff (spec section 3.0).
  const body = await page.locator('body').innerText()
  for (const term of ['age', 'sex', 'bodyweight', 'experience', 'goal']) {
    expect(body.toLowerCase()).not.toContain(term)
  }
})

test('increment options follow the chosen unit', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Pounds (lb)' }).click()
  await page.getByRole('button', { name: 'Yes', exact: true }).click()

  await expect(page.getByRole('button', { name: '5 lb' })).toBeVisible()
  await expect(page.getByRole('button', { name: '10 lb' })).toBeVisible()
  await expect(page.getByRole('button', { name: '2.5 kg' })).toBeHidden()
})

test('stores every answer plus the acknowledgement timestamp', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Pounds (lb)' }).click()
  await page.getByRole('button', { name: 'No', exact: true }).click()
  await page.getByRole('button', { name: '10 lb' }).click()
  await page.getByRole('button', { name: 'I understand' }).click()

  await expect(page).toHaveURL(/\/$/)
  const stored = await settingsJson(page)
  expect(stored.units).toBe('lb')
  expect(stored.hasBench).toBe(false)
  expect(stored.weightIncrement).toBe(10)
  expect(stored.safetyAcknowledgedAt).toBeTruthy()
  expect(stored.onboardingCompletedAt).toBeTruthy()
})

test('the questions can be skipped but the acknowledgement cannot', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Skip' }).click()

  await expect(page.getByRole('heading', { name: 'Before you start' })).toBeVisible()
  // There is no way past this screen except the explicit tap.
  await expect(page.getByRole('button', { name: 'Skip' })).toBeHidden()

  await page.getByRole('button', { name: 'I understand' }).click()
  await expect(page).toHaveURL(/\/$/)
  // Skipping still leaves usable defaults.
  const stored = await settingsJson(page)
  expect(stored.units).toBe('kg')
  expect(stored.weightIncrement).toBe(2.5)
})

test('the safety notice covers what the spec requires', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Skip' }).click()

  const text = (await page.locator('main').innerText()).toLowerCase()
  expect(text).toContain('not medical advice')
  expect(text).toContain('check with a doctor')
  expect(text).toContain('sharp pain')
  expect(text).toContain('cannot see you')
  expect(text).toContain('suggests weight increases')
})

test('onboarding is not shown again once acknowledged', async ({ page }) => {
  await seedSettings(page, ONBOARDED)
  await page.goto('/onboarding')
  await expect(page).toHaveURL(/\/$/)
})

test('no-bench answers swap the movements in a real session', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Kilograms (kg)' }).click()
  await page.getByRole('button', { name: 'No', exact: true }).click()
  await page.getByRole('button', { name: '2.5 kg' }).click()
  await page.getByRole('button', { name: 'I understand' }).click()

  await expect(page.getByText('Flat dumbbell bench press')).toBeHidden()
  await expect(page.getByText('Dumbbell floor press')).toBeVisible()
})

test('every answer is revisable in settings', async ({ page }) => {
  await seedSettings(page, { ...ONBOARDED, units: 'kg', weightIncrement: 2.5, hasBench: true })
  await page.goto('/settings')

  await page.getByRole('button', { name: 'lb', exact: true }).click()
  // Switching units must not leave a 2.5 kg step masquerading as 2.5 lb.
  await expect(page.getByRole('button', { name: '5 lb' })).toHaveAttribute('aria-pressed', 'true')

  await page.getByRole('button', { name: '10 lb' }).click()
  await page.getByLabel('I have a bench').uncheck()

  // Not reloaded: addInitScript re-runs on every navigation and would re-seed
  // the original settings over the changes just made.
  await expect.poll(() => settingsJson(page)).toMatchObject({
    units: 'lb',
    weightIncrement: 10,
    hasBench: false,
  })
})

test('the safety notice stays reachable from settings', async ({ page }) => {
  await seedSettings(page, ONBOARDED)
  await page.goto('/settings')

  await page.getByRole('button', { name: 'Safety information' }).click()
  await expect(page.getByText(/not medical advice/)).toBeVisible()
  await expect(page.getByText(/Acknowledged on/)).toBeVisible()
})
