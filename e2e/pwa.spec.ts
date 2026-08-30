import { test, expect, type Page } from '@playwright/test'
import { seedSettings, ONBOARDED } from './helpers'

/**
 * The PWA surface: offline after first load, and the JSON round trip that is
 * the only way data leaves the device (spec section 8).
 *
 * These tests deliberately do not freeze the clock. Service worker install and
 * activation are driven by real timers, and a paused clock leaves the
 * registration stuck part-way through activating.
 */

const LOG = {
  id: 'log-local',
  programId: 'fullbody-4x',
  sessionId: 'session-a',
  startedAt: '2026-08-20T09:00:00.000Z',
  endedAt: '2026-08-20T09:15:00.000Z',
  completed: true,
  sets: ['set-local'],
  workingTimeMs: 870_000,
  totalElapsedMs: 900_000,
}

const SET = {
  id: 'set-local',
  sessionLogId: 'log-local',
  exerciseId: 'goblet-squat',
  round: 1,
  weightKg: 20,
  reps: 12,
  rir: null,
  confirmed: true,
  completedAt: '2026-08-20T09:03:00.000Z',
}

/**
 * Writes history straight into the database the app has already opened.
 *
 * Running a real session per test would cost a fast-forwarded 14:30 each time
 * for setup that is not what is under test here.
 */
async function seedHistory(page: Page, logs: unknown[], sets: unknown[]): Promise<void> {
  await page.evaluate(
    async ({ logs, sets }) => {
      // Opened at the app's own version, creating the stores if this call
      // wins the race with the app's open. Opening without a version would
      // create an empty v1 database with no object stores whenever it got
      // there first, and the transaction below would then throw.
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('fullbody15', 2)
        request.onupgradeneeded = () => {
          const upgraded = request.result
          if (!upgraded.objectStoreNames.contains('sessionLogs')) {
            upgraded.createObjectStore('sessionLogs', { keyPath: 'id' })
              .createIndex('by-startedAt', 'startedAt')
          }
          if (!upgraded.objectStoreNames.contains('sets')) {
            const store = upgraded.createObjectStore('sets', { keyPath: 'id' })
            store.createIndex('by-sessionLogId', 'sessionLogId')
            store.createIndex('by-exerciseId', 'exerciseId')
          }
          if (!upgraded.objectStoreNames.contains('activeSession')) {
            upgraded.createObjectStore('activeSession')
          }
          if (!upgraded.objectStoreNames.contains('progressionTargets')) {
            upgraded.createObjectStore('progressionTargets', { keyPath: 'exerciseId' })
          }
        }
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['sessionLogs', 'sets'], 'readwrite')
        for (const log of logs) tx.objectStore('sessionLogs').put(log)
        for (const set of sets) tx.objectStore('sets').put(set)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
      db.close()
    },
    { logs, sets },
  )
}

/**
 * Waits until the worker is not just registered but in control of the page.
 *
 * Two traps here, and the first one is silent:
 *
 * - `page.waitForFunction` does **not** await an async predicate. It polls the
 *   function and tests the returned Promise object for truthiness, and a
 *   Promise is always truthy - so `waitForFunction(async () => false)` returns
 *   immediately. `navigator.serviceWorker.ready` inside `page.evaluate`, which
 *   is awaited properly, is the primitive that actually waits.
 * - On `prompt` registration Workbox does not call `clientsClaim`, so the page
 *   that installed the worker is never controlled by it. A reload is what
 *   hands over control, and reloading before activation just starts the wait
 *   over on an uncontrolled page.
 */
async function activateServiceWorker(page: Page): Promise<void> {
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined))
  await page.reload()
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true)
}

/**
 * Web Share is preferred over a download wherever it exists, because an iOS
 * home-screen app has nowhere to put a downloaded file. Headless Chromium does
 * not implement it, but removing it makes which branch runs a property of the
 * test rather than of the browser build.
 */
async function forceDownloadTransport(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true })
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true })
  })
}

test.describe('offline', () => {
  test('the app still starts with the network cut', async ({ page, context }) => {
    await seedSettings(page, ONBOARDED)
    await page.goto('/')
    await expect(page.getByRole('button', { name: /Start Session A/ })).toBeVisible()

    await activateServiceWorker(page)

    await context.setOffline(true)
    await page.reload()

    await expect(page.getByRole('button', { name: /Start Session A/ })).toBeVisible()
    await expect(page.getByText('14:30 planned')).toBeVisible()
  })

  test('a route reached cold offline falls back to the app shell', async ({ page, context }) => {
    await seedSettings(page, ONBOARDED)
    await page.goto('/')
    await activateServiceWorker(page)

    await context.setOffline(true)
    // There is no /history file on the server; without the navigate fallback
    // this is a hard 404 the moment the network is gone.
    await page.goto('/history')

    await expect(page.getByRole('heading', { name: 'History' })).toBeVisible()
  })
})

test.describe('export and import', () => {
  test('exports the history on this device as JSON', async ({ page }) => {
    await forceDownloadTransport(page)
    await seedSettings(page, { ...ONBOARDED, units: 'lb' })
    await page.goto('/')
    await expect(page.getByRole('button', { name: /Start Session A/ })).toBeVisible()
    await seedHistory(page, [LOG], [SET])

    await page.goto('/settings')
    const exportButton = page.getByTestId('export-button')
    await expect(exportButton).toBeEnabled()

    const download = page.waitForEvent('download')
    await exportButton.click()
    const file = await download

    expect(file.suggestedFilename()).toMatch(/^fullbody15-\d{4}-\d{2}-\d{2}\.json$/)

    const stream = await file.createReadStream()
    const chunks: Buffer[] = []
    for await (const chunk of stream) chunks.push(chunk as Buffer)
    const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'))

    expect(payload.format).toBe('fullbody15.export')
    expect(payload.version).toBe(1)
    expect(payload.sessionLogs).toHaveLength(1)
    expect(payload.sessionLogs[0].id).toBe('log-local')
    expect(payload.sets[0].weightKg).toBe(20)
    // Settings travel with the data, so a new phone does not start in kg.
    expect(payload.settings.units).toBe('lb')
  })

  test('an import replaces local history, after saying what it will destroy', async ({ page }) => {
    await seedSettings(page, ONBOARDED)
    await page.goto('/')
    await expect(page.getByRole('button', { name: /Start Session A/ })).toBeVisible()
    await seedHistory(page, [LOG], [SET])

    await page.goto('/settings')
    await expect(page.getByTestId('export-button')).toBeEnabled()

    const incoming = {
      format: 'fullbody15.export',
      version: 1,
      exportedAt: '2026-08-28T10:00:00.000Z',
      settings: { ...ONBOARDED, units: 'lb', weightIncrement: 5 },
      sessionLogs: [
        { ...LOG, id: 'log-imported', sets: ['set-imported'] },
        { ...LOG, id: 'log-imported-2', startedAt: '2026-08-22T09:00:00.000Z', sets: [] },
      ],
      sets: [{ ...SET, id: 'set-imported', sessionLogId: 'log-imported', weightKg: 30, reps: 10 }],
      progressionTargets: [],
    }

    await page.getByTestId('import-input').setInputFiles({
      name: 'fullbody15-2026-08-28.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(incoming)),
    })

    const confirm = page.getByTestId('import-confirm')
    await expect(confirm).toBeVisible()
    // The count that is about to be destroyed has to be in the copy: this is
    // the only screen in the app that can lose someone their history.
    await expect(confirm).toContainText('deletes')
    await expect(confirm).toContainText('1')
    await expect(confirm).toContainText('session')

    await page.getByTestId('import-confirm-button').click()
    await expect(page.getByTestId('import-done')).toContainText('Imported 2 sessions')

    // Settings travel with the data, so the app is now in pounds. Asserted
    // here rather than after a navigation: `seedSettings` runs as an init
    // script, so it re-seeds localStorage on every document and would quietly
    // undo the import before the next page rendered.
    await expect(page.getByRole('button', { name: 'lb', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    await page.goto('/history')
    await expect(
      page.getByRole('region', { name: 'Sessions' }).getByRole('listitem'),
    ).toHaveCount(2)
  })

  test('a file from another app is refused without touching local data', async ({ page }) => {
    await seedSettings(page, ONBOARDED)
    await page.goto('/')
    await expect(page.getByRole('button', { name: /Start Session A/ })).toBeVisible()
    await seedHistory(page, [LOG], [SET])

    await page.goto('/settings')
    await expect(page.getByTestId('export-button')).toBeEnabled()

    await page.getByTestId('import-input').setInputFiles({
      name: 'steps.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ steps: 4021, date: '2026-08-28' })),
    })

    await expect(page.getByTestId('import-error')).toContainText('not exported by this app')
    await expect(page.getByTestId('import-confirm')).toBeHidden()

    // The local session is still there, and still the only one.
    await page.goto('/history')
    await expect(
      page.getByRole('region', { name: 'Sessions' }).getByRole('listitem'),
    ).toHaveCount(1)
  })
})
