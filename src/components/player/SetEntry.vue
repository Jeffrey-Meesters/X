<script setup lang="ts">
import { computed, ref } from 'vue'
import type { SetDraft } from '@/stores/session'
import { useSettingsStore } from '@/stores/settings'
import { formatWeight, toDisplay } from '@/engine/units'
import { getExercise } from '@/data/exercises'

const props = defineProps<{ draft: SetDraft }>()
const emit = defineEmits<{
  adjustWeight: [direction: 1 | -1]
  setWeight: [value: number]
  adjustReps: [delta: number]
  setRir: [value: number | null]
  next: []
}>()

const settingsStore = useSettingsStore()
const units = computed(() => settingsStore.settings.units)

const exercise = computed(() => getExercise(props.draft.exerciseId))
const weightLabel = computed(() => formatWeight(props.draft.weightKg, units.value))

/** Keypad fallback, so no hardware or software keyboard is ever required. */
const editing = ref(false)
const keypadValue = ref('')

function openKeypad(): void {
  keypadValue.value = String(toDisplay(props.draft.weightKg, units.value))
  editing.value = true
}

function commitKeypad(): void {
  const parsed = Number.parseFloat(keypadValue.value)
  if (Number.isFinite(parsed)) emit('setWeight', parsed)
  editing.value = false
}
</script>

<template>
  <section class="rounded-2xl bg-surface-raised p-4" aria-label="Log your set">
    <!--
      Shown only on a first-ever set of an exercise. Guessing a starting load
      from bodyweight predicts upper-body strength poorly, so session one is an
      explicit calibration instead (spec section 3.3).
    -->
    <p v-if="draft.isCalibration" class="mb-3 rounded-xl bg-warmup/15 p-3 text-sm text-warmup">
      Pick a weight where the last two reps are hard but your form holds.
    </p>

    <p class="text-sm text-ink-muted">{{ exercise.name }} &middot; round {{ draft.round }}</p>

    <div class="mt-2 flex items-center gap-3">
      <button
        type="button"
        class="h-16 w-16 shrink-0 rounded-2xl bg-surface text-3xl font-bold"
        aria-label="Decrease weight"
        @click="emit('adjustWeight', -1)"
      >
        &minus;
      </button>

      <button
        v-if="!editing"
        type="button"
        class="tabular flex-1 text-center text-4xl font-bold"
        :aria-label="`Weight ${weightLabel} ${units}. Tap to type a value.`"
        @click="openKeypad"
      >
        {{ weightLabel }}<span class="ml-1 text-lg font-medium text-ink-muted">{{ units }}</span>
      </button>

      <!-- inputmode="decimal" summons the numeric keypad, never a full keyboard -->
      <input
        v-else
        v-model="keypadValue"
        type="text"
        inputmode="decimal"
        class="tabular w-full flex-1 rounded-xl bg-surface px-3 py-2 text-center text-3xl font-bold"
        aria-label="Weight"
        autofocus
        @blur="commitKeypad"
        @keyup.enter="commitKeypad"
      />

      <button
        type="button"
        class="h-16 w-16 shrink-0 rounded-2xl bg-surface text-3xl font-bold"
        aria-label="Increase weight"
        @click="emit('adjustWeight', 1)"
      >
        +
      </button>
    </div>

    <div class="mt-3 flex items-center justify-between gap-3">
      <span class="text-sm text-ink-muted">Reps</span>
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="h-12 w-12 rounded-xl bg-surface text-xl font-bold"
          aria-label="Decrease reps"
          @click="emit('adjustReps', -1)"
        >
          &minus;
        </button>
        <span class="tabular w-10 text-center text-2xl font-bold" data-testid="reps">
          {{ draft.reps }}
        </span>
        <button
          type="button"
          class="h-12 w-12 rounded-xl bg-surface text-xl font-bold"
          aria-label="Increase reps"
          @click="emit('adjustReps', 1)"
        >
          +
        </button>
      </div>
    </div>

    <div v-if="settingsStore.settings.showRir" class="mt-3 flex items-center justify-between gap-2">
      <span class="text-sm text-ink-muted">Reps in reserve</span>
      <div class="flex gap-1">
        <button
          v-for="value in [0, 1, 2, 3]"
          :key="value"
          type="button"
          class="h-12 w-12 rounded-xl text-base font-semibold"
          :class="draft.rir === value ? 'bg-ink text-surface' : 'bg-surface'"
          :aria-pressed="draft.rir === value"
          @click="emit('setRir', draft.rir === value ? null : value)"
        >
          {{ value }}
        </button>
      </div>
    </div>

    <button
      type="button"
      class="mt-4 min-h-14 w-full rounded-xl bg-rest text-lg font-semibold text-surface"
      @click="emit('next')"
    >
      Next
    </button>
  </section>
</template>
