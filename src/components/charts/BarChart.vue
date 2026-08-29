<script setup lang="ts">
import { computed } from 'vue'

export interface Bar {
  readonly label: string
  readonly value: number
  /** Optional weekly target, drawn as a reference tick rather than a second colour. */
  readonly target?: number
}

const props = withDefaults(
  defineProps<{
    title: string
    bars: readonly Bar[]
    format: (value: number) => string
    /** Horizontal bars read better when the category names are words. */
    horizontal?: boolean
    targetLabel?: string
  }>(),
  { horizontal: false, targetLabel: 'target' },
)

const max = computed(() =>
  Math.max(1, ...props.bars.map((b) => Math.max(b.value, b.target ?? 0))),
)

const hasTargets = computed(() => props.bars.some((b) => b.target !== undefined))

function widthPercent(value: number): number {
  return (value / max.value) * 100
}
</script>

<template>
  <figure class="m-0">
    <figcaption class="text-sm font-semibold">{{ title }}</figcaption>

    <p v-if="bars.length === 0" class="mt-3 text-sm text-ink-muted">Nothing logged yet.</p>

    <template v-else>
      <!--
        One hue for every bar. Shading each bar darker-where-bigger would encode
        magnitude twice and imply an order the categories do not have.
        Values are direct-labelled, so no tooltip is needed to read one.
      -->
      <ul class="mt-2 space-y-2" :class="horizontal ? '' : 'flex items-end gap-1.5 space-y-0'">
        <li
          v-for="bar in bars"
          :key="bar.label"
          :class="horizontal ? 'grid grid-cols-[5.5rem_1fr_auto] items-center gap-2' : 'flex flex-1 flex-col items-center gap-1'"
        >
          <template v-if="horizontal">
            <span class="truncate text-xs text-ink-muted">{{ bar.label }}</span>
            <span class="relative block h-5 rounded bg-surface">
              <span class="bar absolute inset-y-0 left-0 rounded" :style="{ width: `${widthPercent(bar.value)}%` }" />
              <span
                v-if="bar.target !== undefined"
                class="reference absolute inset-y-0"
                :style="{ left: `${widthPercent(bar.target)}%` }"
                :aria-label="`${targetLabel} ${bar.target}`"
              />
            </span>
            <span class="tabular text-xs font-semibold">{{ format(bar.value) }}</span>
          </template>

          <template v-else>
            <span class="tabular text-[10px] font-semibold">{{ format(bar.value) }}</span>
            <span class="flex h-24 w-full items-end rounded bg-surface">
              <span
                class="bar w-full rounded"
                :style="{ height: `${Math.max(2, widthPercent(bar.value))}%` }"
              />
            </span>
            <span class="truncate text-[10px] text-ink-muted">{{ bar.label }}</span>
          </template>
        </li>
      </ul>

      <p v-if="hasTargets" class="mt-2 flex items-center gap-1.5 text-xs text-ink-muted">
        <span class="reference-key inline-block h-3 w-0.5 align-middle" aria-hidden="true" />
        Weekly {{ targetLabel }}
      </p>
    </template>
  </figure>
</template>

<style scoped>
.bar {
  background-color: var(--chart-series);
}

/* A thin neutral tick, not a second series colour: the target is a reference,
   not another thing being measured. */
.reference,
.reference-key {
  background-color: var(--chart-reference);
  width: 2px;
}
</style>
