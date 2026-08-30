import { defineConfig, devices } from '@playwright/test'

/**
 * Mobile-first, so the default project is a phone viewport. Session tests use
 * `page.clock` to fast-forward, which is what keeps a full 14:30 run-through
 * finishing in seconds rather than fifteen minutes.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Spread rather than `process.env.CI ? 1 : undefined`: an explicit undefined
  // is not the same as an absent key, and only the absent one means "decide
  // for yourself" - which is what a developer machine wants.
  ...(process.env.CI ? { workers: 1 } : {}),
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
    // Escape hatch for sandboxes that ship a pre-installed Chromium whose build
    // number does not match this Playwright version. Unset everywhere else, so
    // normal machines and CI use the browser Playwright manages itself.
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } }
      : {}),
  },
  projects: [{ name: 'mobile-chrome', use: { ...devices['Pixel 7'] } }],
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
