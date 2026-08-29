import { test, expect } from '@playwright/test'
import { seedSettings, ONBOARDED } from './helpers'

test('home screen offers the next session', async ({ page }) => {
  await seedSettings(page, ONBOARDED)
  await page.goto('/')

  await expect(page.getByRole('heading', { name: '15-Minute Full Body' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Start Session A/ })).toBeVisible()
  await expect(page.getByText('14:30 planned')).toBeVisible()
})

test('start navigates into the player', async ({ page }) => {
  await seedSettings(page, ONBOARDED)
  await page.goto('/')
  await page.getByRole('button', { name: /Start Session A/ }).click()

  await expect(page).toHaveURL(/\/session\/session-a$/)
})
