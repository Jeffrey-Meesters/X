<script setup lang="ts">
import { computed, ref } from 'vue'

export interface LinePoint {
  readonly label: string
  readonly value: number
  readonly caption?: string
}

const props = defineProps<{
  title: string
  points: readonly LinePoint[]
  format: (value: number) => string
}>()

// Plot geometry. The band below the plot is part of the viewBox, so the x-axis
// labels are never clipped by the container.
const W = 320
const H = 168
const PAD = { top: 16, right: 10, bottom: 30, left: 38 }
const plotW = W - PAD.left - PAD.right
const plotH = H - PAD.top - PAD.bottom

const values = computed(() => props.points.map((p) => p.value))

const scale = computed(() => {
  const min = Math.min(...values.value)
  const max = Math.max(...values.value)
  // A flat series would give a zero range and divide by zero; pad it so the
  // line sits mid-plot rather than collapsing onto an edge.
  const pad = max === min ? Math.max(1, max * 0.1) : (max - min) * 0.15
  return { lo: min - pad, hi: max + pad }
})

function x(i: number): number {
  if (props.points.length === 1) return PAD.left + plotW / 2
  return PAD.left + (i / (props.points.length - 1)) * plotW
}

function y(value: number): number {
  const { lo, hi } = scale.value
  return PAD.top + plotH - ((value - lo) / (hi - lo)) * plotH
}

const path = computed(() => props.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)} ${y(p.value)}`).join(' '))

/** Three recessive gridlines: low, middle, high. Solid, never dashed. */
const gridLines = computed(() => {
  const { lo, hi } = scale.value
  return [hi, (hi + lo) / 2, lo].map((value) => ({ value, y: y(value) }))
})

/**
 * Selective direct labels only: the first point, the last, and the best.
 * A number beside every point is chaos and goes unread.
 */
const labelled = computed(() => {
  const n = props.points.length
  if (n === 0) return new Set<number>()
  const best = values.value.indexOf(Math.max(...values.value))
  return new Set([0, n - 1, best])
})

const active = ref<number | null>(null)

function pick(event: PointerEvent): void {
  const svg = event.currentTarget as SVGSVGElement
  const rect = svg.getBoundingClientRect()
  const ratio = ((event.clientX - rect.left) / rect.width) * W
  let nearest = 0
  let best = Infinity
  props.points.forEach((_, i) => {
    const d = Math.abs(x(i) - ratio)
    if (d < best) {
      best = d
      nearest = i
    }
  })
  active.value = nearest
}

const activePoint = computed(() => (active.value === null ? undefined : props.points[active.value]))
</script>

<template>
  <figure class="m-0">
    <figcaption class="text-sm font-semibold">{{ title }}</figcaption>

    <p v-if="points.length === 0" class="mt-3 text-sm text-ink-muted">
      No sessions logged yet.
    </p>

    <template v-else>
      <svg
        :viewBox="`0 0 ${W} ${H}`"
        class="mt-2 w-full touch-none"
        role="img"
        :aria-label="`${title}. ${points.length} sessions, from ${format(points[0]!.value)} to ${format(points[points.length - 1]!.value)}.`"
        @pointermove="pick"
        @pointerdown="pick"
        @pointerleave="active = null"
      >
        <g class="grid">
          <line v-for="g in gridLines" :key="g.value" :x1="PAD.left" :y1="g.y" :x2="W - PAD.right" :y2="g.y" />
        </g>
        <g class="axis-text">
          <text v-for="g in gridLines" :key="g.value" :x="PAD.left - 6" :y="g.y + 3" text-anchor="end">
            {{ format(g.value) }}
          </text>
        </g>

        <!-- Crosshair sits under the marks so it never obscures them. -->
        <line
          v-if="active !== null"
          class="crosshair"
          :x1="x(active)"
          :y1="PAD.top"
          :x2="x(active)"
          :y2="PAD.top + plotH"
        />

        <path class="series" :d="path" />

        <g>
          <circle
            v-for="(p, i) in points"
            :key="i"
            class="marker"
            :class="{ 'is-active': active === i }"
            :cx="x(i)"
            :cy="y(p.value)"
            r="4.5"
          />
        </g>

        <g class="value-text">
          <text
            v-for="(p, i) in points"
            v-show="labelled.has(i) && active !== i"
            :key="i"
            :x="x(i)"
            :y="y(p.value) - 9"
            :text-anchor="i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'"
          >
            {{ format(p.value) }}
          </text>
        </g>

        <g class="axis-text">
          <text :x="PAD.left" :y="H - 10" text-anchor="start">{{ points[0]!.label }}</text>
          <text v-if="points.length > 1" :x="W - PAD.right" :y="H - 10" text-anchor="end">
            {{ points[points.length - 1]!.label }}
          </text>
        </g>
      </svg>

      <p v-if="activePoint" class="tabular mt-1 text-center text-sm" aria-live="polite">
        <strong>{{ format(activePoint.value) }}</strong>
        <span class="text-ink-muted"> · {{ activePoint.label }}</span>
        <span v-if="activePoint.caption" class="text-ink-muted"> · {{ activePoint.caption }}</span>
      </p>

      <!-- A tooltip is never the only way to read a value. -->
      <details class="mt-2">
        <summary class="cursor-pointer text-xs text-ink-muted">Show values</summary>
        <table class="mt-2 w-full text-left text-xs">
          <thead class="text-ink-muted">
            <tr><th scope="col" class="font-medium">Session</th><th scope="col" class="font-medium">Value</th></tr>
          </thead>
          <tbody class="tabular">
            <tr v-for="(p, i) in points" :key="i">
              <td>{{ p.label }}</td>
              <td>{{ format(p.value) }}</td>
            </tr>
          </tbody>
        </table>
      </details>
    </template>
  </figure>
</template>

<style scoped>
.grid line {
  stroke: var(--chart-grid);
  stroke-width: 1;
}

.crosshair {
  stroke: var(--chart-reference);
  stroke-width: 1;
}

.series {
  fill: none;
  stroke: var(--chart-series);
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.marker {
  fill: var(--chart-series);
  /* A surface ring separates overlapping marks without drawing a border. */
  stroke: var(--color-surface-raised);
  stroke-width: 2;
}

.marker.is-active {
  r: 6;
}

.axis-text text {
  fill: var(--color-ink-muted);
  font-size: 9px;
}

/* Values wear text tokens, never the series colour. */
.value-text text {
  fill: var(--color-ink);
  font-size: 10px;
  font-weight: 600;
}
</style>
