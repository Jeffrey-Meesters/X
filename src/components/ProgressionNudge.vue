<script setup lang="ts">
import { computed } from 'vue'
import { getExercise } from '@/data/exercises'
import { formatWeight } from '@/engine/units'
import type { Units } from '@/types/models'

const props = defineProps<{
  exerciseId: string
  currentWeightKg: number
  suggestedWeightKg: number
  steps: number
  units: Units
  decided?: 'accepted' | 'declined' | undefined
}>()

defineEmits<{ accept: []; decline: [] }>()

const exercise = computed(() => getExercise(props.exerciseId))
const increase = computed(() =>
  formatWeight(props.suggestedWeightKg - props.currentWeightKg, props.units),
)
</script>

<template>
  <div class="rounded-xl bg-surface-raised p-4">
    <p class="text-sm">
      You hit the top of the range on every round of
      <strong>{{ exercise.name }}</strong
      >. Try
      <strong class="text-work">+{{ increase }} {{ units }}</strong>
      next time<span v-if="steps > 1" class="text-ink-muted">
        (a double step, while you find your weight)</span
      >.
    </p>

    <p v-if="decided === 'accepted'" class="mt-3 text-sm font-medium text-work">
      Next session starts at {{ formatWeight(suggestedWeightKg, units) }} {{ units }}.
    </p>
    <p v-else-if="decided === 'declined'" class="mt-3 text-sm text-ink-muted">
      Staying at {{ formatWeight(currentWeightKg, units) }} {{ units }}.
    </p>

    <!--
      Both options are the same size and weight. The spec is explicit that the
      automated suggestion must never be the path of least resistance, so
      declining is a single tap and carries no penalty (spec section 10).
    -->
    <div v-else class="mt-3 flex gap-2">
      <button
        type="button"
        class="min-h-12 flex-1 rounded-xl bg-work text-base font-semibold text-surface"
        @click="$emit('accept')"
      >
        Use {{ formatWeight(suggestedWeightKg, units) }} {{ units }}
      </button>
      <button
        type="button"
        class="min-h-12 flex-1 rounded-xl bg-surface text-base font-semibold"
        @click="$emit('decline')"
      >
        Not this time
      </button>
    </div>
  </div>
</template>
