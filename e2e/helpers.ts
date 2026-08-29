import type { Page } from '@playwright/test'

/** Fixed start time so countdown assertions are deterministic. */
export const T0 = new Date('2026-08-29T09:00:00Z')

/**
 * `install()` leaves the clock ticking and `pauseAt()` is a second round trip,
 * so by the time it lands the fake clock has moved past T0. Pausing at an
 * instant comfortably in the future removes that race; nothing is loaded yet,
 * so no application timer fires while crossing the gap.
 */
export const FROZEN_AT = new Date(T0.getTime() + 60_000)

/**
 * Settings for a user who has already been through onboarding.
 *
 * The router sends anyone without `safetyAcknowledgedAt` to the onboarding
 * flow, so every test that is not *about* onboarding has to seed it.
 */
export const ONBOARDED = {
  onboardingCompletedAt: '2026-08-01T08:00:00.000Z',
  safetyAcknowledgedAt: '2026-08-01T08:00:00.000Z',
}

export async function seedSettings(page: Page, settings: Record<string, unknown>): Promise<void> {
  await page.addInitScript((value) => {
    localStorage.setItem('fullbody15.settings', JSON.stringify(value))
  }, settings)
}

/** Freeze the clock, seed an onboarded user, and navigate. */
export async function openFrozen(
  page: Page,
  path: string,
  settings: Record<string, unknown> = {},
): Promise<void> {
  await page.clock.install({ time: T0 })
  await page.clock.pauseAt(FROZEN_AT)
  await seedSettings(page, { ...ONBOARDED, ...settings })
  await page.goto(path)
}
