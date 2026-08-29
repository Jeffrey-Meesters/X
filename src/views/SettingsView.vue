<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useSettingsStore } from '@/stores/settings'
import type { Units } from '@/types/models'
import SafetyNotice from '@/components/onboarding/SafetyNotice.vue'

/**
 * Every onboarding answer is revisable here (spec section 3.0), and the safety
 * acknowledgement stays permanently reachable (spec section 10).
 *
 * Session structure - durations, rounds, exercise swaps - lands in the
 * customisation milestone.
 */
const settingsStore = useSettingsStore()
const settings = computed(() => settingsStore.settings)

const incrementOptions = computed(() => (settings.value.units === 'kg' ? [2.5, 5] : [5, 10]))

function setUnits(units: Units): void {
  if (units === settings.value.units) return
  // The stored increment is in display units, so a 2.5 kg step would silently
  // become a nonsensical 2.5 lb one. Reset to that unit's sensible default.
  settingsStore.update({ units, weightIncrement: units === 'kg' ? 2.5 : 5 })
}

const showSafety = ref(false)

const acknowledgedOn = computed(() => {
  const stamp = settings.value.safetyAcknowledgedAt
  if (!stamp) return null
  return new Date(stamp).toLocaleDateString()
})
</script>

<template>
  <main class="mx-auto min-h-dvh max-w-md p-6">
    <header class="flex items-center justify-between">
      <h1 class="text-3xl font-bold">Settings</h1>
      <RouterLink to="/" class="min-h-12 px-3 leading-[3rem] text-ink-muted underline">
        Done
      </RouterLink>
    </header>

    <section class="mt-8" aria-labelledby="units-heading">
      <h2 id="units-heading" class="text-sm tracking-wide text-ink-muted uppercase">Units</h2>
      <div class="mt-2 flex gap-3">
        <button
          v-for="option in (['kg', 'lb'] as Units[])"
          :key="option"
          type="button"
          class="min-h-14 flex-1 rounded-xl text-lg font-semibold"
          :class="settings.units === option ? 'bg-ink text-surface' : 'bg-surface-raised'"
          :aria-pressed="settings.units === option"
          @click="setUnits(option)"
        >
          {{ option }}
        </button>
      </div>
    </section>

    <section class="mt-6" aria-labelledby="increment-heading">
      <h2 id="increment-heading" class="text-sm tracking-wide text-ink-muted uppercase">
        Weight increment
      </h2>
      <div class="mt-2 flex gap-3">
        <button
          v-for="option in incrementOptions"
          :key="option"
          type="button"
          class="min-h-14 flex-1 rounded-xl text-lg font-semibold"
          :class="
            settings.weightIncrement === option ? 'bg-ink text-surface' : 'bg-surface-raised'
          "
          :aria-pressed="settings.weightIncrement === option"
          @click="settingsStore.update({ weightIncrement: option })"
        >
          {{ option }} {{ settings.units }}
        </button>
      </div>
    </section>

    <section class="mt-6" aria-labelledby="equipment-heading">
      <h2 id="equipment-heading" class="text-sm tracking-wide text-ink-muted uppercase">
        Equipment
      </h2>
      <label class="mt-2 flex min-h-14 items-center justify-between rounded-xl bg-surface-raised px-4">
        <span class="text-lg">I have a bench</span>
        <input
          type="checkbox"
          class="h-6 w-6"
          :checked="settings.hasBench"
          @change="settingsStore.update({ hasBench: ($event.target as HTMLInputElement).checked })"
        />
      </label>
      <p class="mt-2 text-sm text-ink-muted">
        Turning this off swaps in floor and standing versions of the movements
        that need a bench.
      </p>
    </section>

    <section class="mt-6" aria-labelledby="session-heading">
      <h2 id="session-heading" class="text-sm tracking-wide text-ink-muted uppercase">Session</h2>
      <label class="mt-2 flex min-h-14 items-center justify-between rounded-xl bg-surface-raised px-4">
        <span class="text-lg">5-second lead-in</span>
        <input
          type="checkbox"
          class="h-6 w-6"
          :checked="settings.leadIn"
          @change="settingsStore.update({ leadIn: ($event.target as HTMLInputElement).checked })"
        />
      </label>
      <label class="mt-3 flex min-h-14 items-center justify-between rounded-xl bg-surface-raised px-4">
        <span class="text-lg">Reps-in-reserve selector</span>
        <input
          type="checkbox"
          class="h-6 w-6"
          :checked="settings.showRir"
          @change="settingsStore.update({ showRir: ($event.target as HTMLInputElement).checked })"
        />
      </label>
    </section>

    <section class="mt-6 mb-8" aria-labelledby="about-heading">
      <h2 id="about-heading" class="text-sm tracking-wide text-ink-muted uppercase">About</h2>
      <button
        type="button"
        class="mt-2 min-h-14 w-full rounded-xl bg-surface-raised px-4 text-left text-lg"
        :aria-expanded="showSafety"
        @click="showSafety = !showSafety"
      >
        Safety information
      </button>
      <div v-if="showSafety" class="mt-3 rounded-xl bg-surface-raised p-4">
        <SafetyNotice />
        <p v-if="acknowledgedOn" class="mt-4 text-sm text-ink-muted">
          Acknowledged on {{ acknowledgedOn }}.
        </p>
      </div>
    </section>
  </main>
</template>
