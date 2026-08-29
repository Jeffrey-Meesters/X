<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useSettingsStore } from '@/stores/settings'
import { DEFAULT_SETTINGS } from '@/stores/settings'
import type { Units } from '@/types/models'
import SafetyNotice from '@/components/onboarding/SafetyNotice.vue'

/**
 * First run (spec section 3.0).
 *
 * Three questions, then the safety acknowledgement. The questions are
 * skippable and each one exists only because it changes app behaviour.
 *
 * Deliberately not asked: age, sex, bodyweight, training experience, goals.
 * None of them change anything in v1, so collecting them would be friction with
 * no payoff and personal data with no purpose.
 */
const router = useRouter()
const settingsStore = useSettingsStore()

type Step = 'units' | 'bench' | 'increment' | 'safety'
const ORDER: Step[] = ['units', 'bench', 'increment', 'safety']

const step = ref<Step>('units')
const stepNumber = computed(() => ORDER.indexOf(step.value) + 1)

const units = ref<Units>(DEFAULT_SETTINGS.units)
const hasBench = ref(DEFAULT_SETTINGS.hasBench)
const increment = ref(DEFAULT_SETTINGS.weightIncrement)

/** Plate increments differ by unit, so the options follow the first answer. */
const incrementOptions = computed(() => (units.value === 'kg' ? [2.5, 5] : [5, 10]))

function chooseUnits(value: Units): void {
  units.value = value
  increment.value = value === 'kg' ? 2.5 : 5
  step.value = 'bench'
}

function chooseBench(value: boolean): void {
  hasBench.value = value
  step.value = 'increment'
}

function chooseIncrement(value: number): void {
  increment.value = value
  step.value = 'safety'
}

/** The questions are skippable; the acknowledgement is not. */
function skipToSafety(): void {
  step.value = 'safety'
}

function acknowledge(): void {
  const now = new Date().toISOString()
  settingsStore.update({
    units: units.value,
    hasBench: hasBench.value,
    weightIncrement: increment.value,
    onboardingCompletedAt: now,
    safetyAcknowledgedAt: now,
  })
  void router.replace('/')
}
</script>

<template>
  <main class="mx-auto flex min-h-dvh max-w-md flex-col p-6">
    <header class="flex items-baseline justify-between">
      <p class="text-sm text-ink-muted">Step {{ stepNumber }} of {{ ORDER.length }}</p>
      <button
        v-if="step !== 'safety'"
        type="button"
        class="min-h-12 px-3 text-sm text-ink-muted underline"
        @click="skipToSafety"
      >
        Skip
      </button>
    </header>

    <section v-if="step === 'units'" class="mt-8">
      <h1 class="text-3xl font-bold">Kilograms or pounds?</h1>
      <p class="mt-2 text-ink-muted">You can change this later.</p>
      <div class="mt-6 space-y-3">
        <button
          v-for="option in (['kg', 'lb'] as Units[])"
          :key="option"
          type="button"
          class="min-h-16 w-full rounded-2xl bg-surface-raised text-xl font-semibold"
          @click="chooseUnits(option)"
        >
          {{ option === 'kg' ? 'Kilograms (kg)' : 'Pounds (lb)' }}
        </button>
      </div>
    </section>

    <section v-else-if="step === 'bench'" class="mt-8">
      <h1 class="text-3xl font-bold">Do you have a bench?</h1>
      <!-- The only reason the substitutions field exists: without this question
           it would be dead data (spec section 3.0). -->
      <p class="mt-2 text-ink-muted">
        Without one, we swap in floor and standing versions of the movements that
        need it.
      </p>
      <div class="mt-6 space-y-3">
        <button
          type="button"
          class="min-h-16 w-full rounded-2xl bg-surface-raised text-xl font-semibold"
          @click="chooseBench(true)"
        >
          Yes
        </button>
        <button
          type="button"
          class="min-h-16 w-full rounded-2xl bg-surface-raised text-xl font-semibold"
          @click="chooseBench(false)"
        >
          No
        </button>
      </div>
    </section>

    <section v-else-if="step === 'increment'" class="mt-8">
      <h1 class="text-3xl font-bold">Smallest weight you can add?</h1>
      <p class="mt-2 text-ink-muted">
        This drives the +/- buttons and every progression suggestion.
      </p>
      <div class="mt-6 space-y-3">
        <button
          v-for="option in incrementOptions"
          :key="option"
          type="button"
          class="min-h-16 w-full rounded-2xl bg-surface-raised text-xl font-semibold"
          @click="chooseIncrement(option)"
        >
          {{ option }} {{ units }}
        </button>
      </div>
    </section>

    <section v-else class="mt-8">
      <h1 class="text-3xl font-bold">Before you start</h1>
      <div class="mt-4">
        <SafetyNotice />
      </div>
    </section>

    <!-- Acknowledging is an explicit tap, and the only way past this screen. -->
    <div v-if="step === 'safety'" class="mt-auto pt-8">
      <button
        type="button"
        class="min-h-16 w-full rounded-2xl bg-work text-xl font-semibold text-surface"
        @click="acknowledge"
      >
        I understand
      </button>
      <p class="mt-3 text-center text-sm text-ink-muted">
        You can read this again any time in Settings.
      </p>
    </div>
  </main>
</template>
