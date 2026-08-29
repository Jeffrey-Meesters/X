import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import type { Settings } from '@/types/models'

const STORAGE_KEY = 'fullbody15.settings'

export const DEFAULT_SETTINGS: Settings = {
  units: 'kg',
  weightIncrement: 2.5,
  hasBench: true,
  onboardingCompletedAt: null,
  safetyAcknowledgedAt: null,
  audioCues: true,
  voiceAnnouncements: true,
  haptics: true,
  keepScreenAwake: true,
  theme: 'auto',
  leadIn: true,
  showRir: false,
}

/**
 * Settings live in localStorage rather than IndexedDB: they are a single small
 * object read synchronously on boot, and the player should never wait on an
 * async open to know whether audio is on.
 */
function load(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_SETTINGS }
    // Merged over the defaults so a build that adds a setting does not read
    // `undefined` out of a older stored object.
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) }
  } catch {
    // Private browsing, disabled storage, or corrupt JSON. Defaults are fine.
    return { ...DEFAULT_SETTINGS }
  }
}

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<Settings>(load())

  watch(
    settings,
    (value) => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
      } catch {
        // Storage unavailable. The session still runs; preferences just reset.
      }
    },
    { deep: true },
  )

  function update(patch: Partial<Settings>): void {
    settings.value = { ...settings.value, ...patch }
  }

  function reset(): void {
    settings.value = { ...DEFAULT_SETTINGS }
  }

  return { settings, update, reset }
})
