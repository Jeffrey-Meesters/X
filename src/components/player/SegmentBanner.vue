<script setup lang="ts">
import { computed } from 'vue'
import type { SegmentType } from '@/engine/segments'

const props = defineProps<{ type: SegmentType; paused: boolean }>()

/**
 * Work and rest must never be distinguishable by colour alone (spec section 9),
 * so each state carries a label and a distinct shape as well as a hue.
 */
const LABELS: Record<SegmentType, string> = {
  'lead-in': 'Get ready',
  warmup: 'Warm-up',
  work: 'Work',
  transition: 'Rest',
  finisher: 'Finisher',
}

const label = computed(() => (props.paused ? 'Paused' : LABELS[props.type]))
const isWork = computed(() => props.type === 'work' || props.type === 'finisher')

const tone = computed(() => {
  if (props.paused) return 'bg-surface-raised text-ink'
  if (props.type === 'warmup' || props.type === 'lead-in') return 'bg-warmup text-surface'
  return isWork.value ? 'bg-work text-surface' : 'bg-rest text-surface'
})
</script>

<template>
  <p
    data-testid="segment-label"
    class="inline-flex items-center gap-2 rounded-full px-5 py-2 text-lg font-bold tracking-wide uppercase"
    :class="tone"
  >
    <!-- Shape carries the same information as the colour: a filled square for
         effort, a hollow circle for recovery, two bars for paused. -->
    <svg viewBox="0 0 12 12" class="h-3 w-3" aria-hidden="true">
      <rect v-if="paused" x="1" y="1" width="3.5" height="10" fill="currentColor" />
      <rect v-if="paused" x="7.5" y="1" width="3.5" height="10" fill="currentColor" />
      <rect v-else-if="isWork" x="0" y="0" width="12" height="12" fill="currentColor" />
      <circle v-else cx="6" cy="6" r="5" fill="none" stroke="currentColor" stroke-width="2" />
    </svg>
    {{ label }}
  </p>
</template>
