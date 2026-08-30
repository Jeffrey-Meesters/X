import { onScopeDispose, ref, watchEffect } from 'vue'
import { storeToRefs } from 'pinia'
import { useSettingsStore } from '@/stores/settings'
import type { Theme } from '@/types/models'

/**
 * Applies the theme to the root element (spec section 12).
 *
 * The class strategy, not a media query, so the theme can be toggled
 * independently of the OS. `auto` follows `prefers-color-scheme` and keeps
 * following it: someone whose phone flips to dark at sunset should not have to
 * reopen the app.
 */

const STORAGE_KEY = 'fullbody15.settings'

function query(): MediaQueryList | undefined {
  return typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : undefined
}

export function resolveTheme(theme: Theme, prefersDark: boolean): 'light' | 'dark' {
  if (theme === 'auto') return prefersDark ? 'dark' : 'light'
  return theme
}

export function applyTheme(resolved: 'light' | 'dark'): void {
  const root = document.documentElement
  root.classList.toggle('dark', resolved === 'dark')
  root.classList.toggle('light', resolved === 'light')
}

/**
 * Reads the stored theme and applies it, without Vue or Pinia.
 *
 * Called from `main.ts` before the app mounts. The markup ships with
 * `class="dark"`, so a light-theme user would otherwise get a dark frame
 * painted and then repainted the moment the store came up.
 */
export function applyStoredTheme(): void {
  let theme: Theme = 'auto'
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const stored = (JSON.parse(raw) as { theme?: unknown }).theme
      if (stored === 'auto' || stored === 'light' || stored === 'dark') theme = stored
    }
  } catch {
    // Storage unavailable or corrupt. `auto` is the right thing to fall back to.
  }
  applyTheme(resolveTheme(theme, query()?.matches ?? true))
}

/** Keeps the root element in step with the setting, and with the OS on `auto`. */
export function useTheme(): void {
  const { settings } = storeToRefs(useSettingsStore())
  const media = query()

  // The media query is not reactive on its own, so its current value is
  // mirrored into a ref and the listener is what makes `auto` live.
  const prefersDark = ref(media?.matches ?? true)
  const onChange = (event: MediaQueryListEvent): void => {
    prefersDark.value = event.matches
  }
  media?.addEventListener('change', onChange)
  onScopeDispose(() => media?.removeEventListener('change', onChange))

  watchEffect(() => {
    applyTheme(resolveTheme(settings.value.theme, prefersDark.value))
  })
}
