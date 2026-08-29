<script setup lang="ts">
import { computed } from 'vue'
import { getExercise } from '@/data/exercises'

/**
 * Placeholder movement illustration.
 *
 * Establishes the interface the hand-authored per-exercise animations will
 * implement in milestone 8: same props, same 200x200 viewBox, same fixed ground
 * line at y=185, `currentColor` for the body and `--accent` for the load. Swapping
 * in a real animation is then a component substitution, not a layout change.
 */
const props = defineProps<{ exerciseId: string; paused?: boolean }>()

const exercise = computed(() => getExercise(props.exerciseId))
const hasLoad = computed(() => exercise.value.equipment.includes('dumbbell'))
</script>

<template>
  <svg
    viewBox="0 0 200 200"
    role="img"
    class="h-full w-full text-ink"
    :class="{ 'is-paused': paused }"
  >
    <title>{{ exercise.name }}</title>

    <!-- Ground line is fixed across every exercise so the figure does not jump
         between segments. -->
    <line x1="20" y1="185" x2="180" y2="185" stroke="currentColor" stroke-width="2" opacity="0.3" />

    <g fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round">
      <circle cx="100" cy="58" r="14" />
      <line x1="100" y1="72" x2="100" y2="118" />
      <line x1="100" y1="118" x2="86" y2="158" />
      <line x1="100" y1="118" x2="114" y2="158" />
      <line x1="86" y1="158" x2="84" y2="185" />
      <line x1="114" y1="158" x2="116" y2="185" />
      <line x1="100" y1="88" x2="76" y2="110" />
      <line x1="100" y1="88" x2="124" y2="110" />
    </g>

    <g v-if="hasLoad" fill="var(--accent, var(--color-work))">
      <rect x="64" y="102" width="18" height="10" rx="5" />
      <rect x="118" y="102" width="18" height="10" rx="5" />
    </g>
  </svg>
</template>
