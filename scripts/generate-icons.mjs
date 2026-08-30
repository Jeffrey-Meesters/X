/**
 * Renders the app mark to the PNG sizes a manifest and iOS need.
 *
 * The PNGs are committed, so this only runs when the mark changes - but it is
 * checked in so they stay reproducible rather than being binaries nobody can
 * regenerate. Chromium does the rasterising because it is already here for
 * Playwright, and it is the same renderer that will draw the SVG favicon.
 *
 *   node scripts/generate-icons.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import { iconSvg } from './icon.mjs'

// A maskable icon may be cropped to a circle of 80% diameter. The mark's
// furthest corner sits at ~229 units from centre at full scale, against a
// 204.8 safe radius, so it has to come in - 0.8 leaves margin for launchers
// that crop harder than the spec's minimum.
const MASKABLE_SCALE = 0.8

const targets = [
  { file: 'icon-192.png', size: 192, scale: 1 },
  { file: 'icon-512.png', size: 512, scale: 1 },
  { file: 'icon-maskable-512.png', size: 512, scale: MASKABLE_SCALE },
  // iOS ignores the manifest's icons and applies its own rounded mask, so it
  // gets a full-bleed `any` icon at the size Safari asks for.
  { file: 'apple-touch-icon.png', size: 180, scale: 1 },
]

const outDir = fileURLToPath(new URL('../public/icons/', import.meta.url))
await mkdir(outDir, { recursive: true })

// The SVG favicon is the mark itself - no rasterising, and it stays sharp at
// any tab density.
await writeFile(new URL('favicon.svg', `file://${outDir}`), iconSvg({ size: 512, scale: 1 }))

// Same escape hatch as playwright.config.ts: in a sandbox whose pre-installed
// Chromium does not match the pinned Playwright revision, point at it.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
const browser = await chromium.launch(executablePath ? { executablePath } : {})
try {
  for (const { file, size, scale } of targets) {
    const page = await browser.newPage({ viewport: { width: size, height: size } })
    await page.setContent(
      `<style>html,body{margin:0;padding:0}svg{display:block}</style>${iconSvg({ size, scale })}`,
    )
    await page.locator('svg').screenshot({ path: `${outDir}${file}`, omitBackground: false })
    await page.close()
    console.log(`wrote public/icons/${file} (${size}px, scale ${scale})`)
  }
} finally {
  await browser.close()
}
