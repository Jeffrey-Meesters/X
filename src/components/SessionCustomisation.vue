<script setup lang="ts">
import { computed } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { getExercise } from '@/data/exercises'
import {
  SESSION_TEMPLATES,
  buildOptionsFor,
  effectiveExerciseId,
  supportsExtraSet,
} from '@/data/sessions'
import { buildSegmentList, totalDurationMs } from '@/engine/segments'
import { formatDuration } from '@/engine/format'
import { DEFAULT_SETTINGS } from '@/stores/settings'

/**
 * Session shape and exercise swaps (spec section 3.6).
 *
 * Every control shows its consequence on the session length as you change it.
 * This is a fifteen-minute-workout app; letting someone quietly turn it into a
 * twenty-two-minute one without saying so would be the wrong kind of quiet.
 */
const settingsStore = useSettingsStore()
const settings = computed(() => settingsStore.settings)

/** Bounds are about keeping a circuit a circuit, not about safety. */
const LIMITS = {
  workSec: { min: 20, max: 90, step: 5 },
  transitionSec: { min: 10, max: 60, step: 5 },
  rounds: { min: 2, max: 5, step: 1 },
} as const

type Shape = keyof typeof LIMITS

const shapeFields: readonly { key: Shape; label: string; unit: string }[] = [
  { key: 'workSec', label: 'Work', unit: 's' },
  { key: 'transitionSec', label: 'Transition', unit: 's' },
  { key: 'rounds', label: 'Rounds', unit: '' },
]

function step(key: Shape, direction: 1 | -1): void {
  const { min, max, step: size } = LIMITS[key]
  const next = Math.min(max, Math.max(min, settings.value[key] + direction * size))
  settingsStore.update({ [key]: next })
}

/** Length of each session as currently configured, lead-in excluded. */
const plannedLengths = computed(() =>
  SESSION_TEMPLATES.map((template) => ({
    id: template.id,
    name: template.name,
    duration: formatDuration(
      totalDurationMs(
        buildSegmentList(template, {
          ...buildOptionsFor(settings.value, template.id),
          leadIn: false,
        }),
      ),
    ),
  })),
)

/**
 * Swap choices for one circuit slot: the movement the template names, plus
 * whatever the library offers in its place.
 *
 * Filtered by equipment, because offering a bench press to someone who has
 * already said they have no bench is offering them something they cannot do -
 * and an explicit swap overrides the equipment substitution, so it would stick.
 */
function optionsFor(templateExerciseId: string) {
  const base = getExercise(templateExerciseId)
  const ids = [base.id, ...base.substitutions]
  return ids
    .map((id) => getExercise(id))
    .filter(
      (exercise) => settings.value.hasBench || !exercise.equipment.includes('bench'),
    )
}

function swap(templateExerciseId: string, chosenId: string): void {
  const next = { ...settings.value.exerciseSwaps }
  // A choice that matches what the equipment answer would pick anyway is
  // stored as "no opinion", so turning the bench back on stops overriding it.
  if (chosenId === templateExerciseId) delete next[templateExerciseId]
  else next[templateExerciseId] = chosenId
  settingsStore.update({ exerciseSwaps: next })
}

const isDefault = computed(
  () =>
    settings.value.workSec === DEFAULT_SETTINGS.workSec &&
    settings.value.transitionSec === DEFAULT_SETTINGS.transitionSec &&
    settings.value.rounds === DEFAULT_SETTINGS.rounds &&
    Object.keys(settings.value.exerciseSwaps).length === 0 &&
    settings.value.extraShoulderSet === DEFAULT_SETTINGS.extraShoulderSet,
)

function resetShape(): void {
  settingsStore.update({
    workSec: DEFAULT_SETTINGS.workSec,
    transitionSec: DEFAULT_SETTINGS.transitionSec,
    rounds: DEFAULT_SETTINGS.rounds,
    exerciseSwaps: {},
    extraShoulderSet: DEFAULT_SETTINGS.extraShoulderSet,
  })
}
</script>

<template>
  <section aria-labelledby="shape-heading">
    <h2 id="shape-heading" class="text-sm tracking-wide text-ink-muted uppercase">
      Session shape
    </h2>

    <div
      v-for="field in shapeFields"
      :key="field.key"
      class="mt-3 flex min-h-14 items-center justify-between rounded-xl bg-surface-raised px-3 first:mt-2"
    >
      <span class="text-lg">{{ field.label }}</span>
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="h-12 w-12 rounded-lg bg-surface text-2xl disabled:opacity-40"
          :aria-label="`Decrease ${field.label.toLowerCase()}`"
          :data-testid="`${field.key}-down`"
          :disabled="settings[field.key] <= LIMITS[field.key].min"
          @click="step(field.key, -1)"
        >
          −
        </button>
        <span
          class="tabular w-16 text-center text-lg font-semibold"
          :data-testid="`${field.key}-value`"
          aria-live="polite"
        >
          {{ settings[field.key] }}{{ field.unit }}
        </span>
        <button
          type="button"
          class="h-12 w-12 rounded-lg bg-surface text-2xl disabled:opacity-40"
          :aria-label="`Increase ${field.label.toLowerCase()}`"
          :data-testid="`${field.key}-up`"
          :disabled="settings[field.key] >= LIMITS[field.key].max"
          @click="step(field.key, 1)"
        >
          +
        </button>
      </div>
    </div>

    <p class="mt-3 text-sm text-ink-muted" data-testid="planned-lengths">
      <span v-for="(session, i) in plannedLengths" :key="session.id">
        <template v-if="i > 0"> · </template>{{ session.name }}
        <span class="tabular">{{ session.duration }}</span>
      </span>
    </p>

    <button
      v-if="!isDefault"
      type="button"
      class="mt-3 min-h-12 text-sm text-ink-muted underline"
      data-testid="reset-shape"
      @click="resetShape"
    >
      Reset to the default program
    </button>
  </section>

  <section
    v-for="template in SESSION_TEMPLATES"
    :key="template.id"
    class="mt-6"
    :aria-labelledby="`${template.id}-heading`"
  >
    <h2
      :id="`${template.id}-heading`"
      class="text-sm tracking-wide text-ink-muted uppercase"
    >
      {{ template.name }} exercises
    </h2>

    <label
      v-for="entry in template.circuit.exercises"
      :key="entry.exerciseId"
      class="mt-3 block first:mt-2"
    >
      <span class="sr-only">Exercise in place of {{ getExercise(entry.exerciseId).name }}</span>
      <select
        class="min-h-14 w-full rounded-xl bg-surface-raised px-3 text-base"
        :data-testid="`swap-${entry.exerciseId}`"
        :value="effectiveExerciseId(entry.exerciseId, settings)"
        @change="swap(entry.exerciseId, ($event.target as HTMLSelectElement).value)"
      >
        <option
          v-for="option in optionsFor(entry.exerciseId)"
          :key="option.id"
          :value="option.id"
        >
          {{ option.name }}
        </option>
      </select>
    </label>

    <!-- Spec section 2: 60 minutes of lifting a week leaves shoulders on six
         direct sets. Offered, not recommended - core work is more broadly
         useful to a general audience than extra delt volume. -->
    <label
      v-if="supportsExtraSet(template.id)"
      class="mt-3 flex min-h-14 items-center justify-between rounded-xl bg-surface-raised px-4"
    >
      <span class="text-lg">Fourth shoulder set instead of the finisher</span>
      <input
        type="checkbox"
        class="h-6 w-6 shrink-0"
        data-testid="extra-shoulder-set"
        :checked="settings.extraShoulderSet"
        @change="
          settingsStore.update({
            extraShoulderSet: ($event.target as HTMLInputElement).checked,
          })
        "
      />
    </label>
  </section>
</template>
