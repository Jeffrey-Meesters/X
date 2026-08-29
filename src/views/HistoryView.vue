<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useHistoryStore } from '@/stores/history'
import { useSettingsStore } from '@/stores/settings'
import { EXERCISES, getExercise } from '@/data/exercises'
import { SESSIONS_BY_ID } from '@/data/sessions'
import { bestSet, exerciseHistory, weeklySummaries } from '@/engine/summary'
import { estimateOneRepMax, formatWeight, totalVolumeKg } from '@/engine/units'
import { formatDuration } from '@/engine/format'
import LineChart, { type LinePoint } from '@/components/charts/LineChart.vue'
import BarChart, { type Bar } from '@/components/charts/BarChart.vue'
import StatTile from '@/components/charts/StatTile.vue'

/** Per-exercise, per-session and weekly history (spec section 3.5). */
const history = useHistoryStore()
const settingsStore = useSettingsStore()
const ready = ref(false)

onMounted(async () => {
  await history.load()
  ready.value = true
})

const units = computed(() => settingsStore.settings.units)
const weight = (kg: number) => formatWeight(kg, units.value)
const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

/** Weekly volume targets from spec section 2, for the reference ticks. */
const MUSCLE_TARGETS: Readonly<Record<string, number>> = {
  quads: 18,
  glutes: 18,
  hamstrings: 18,
  back: 12,
  lats: 12,
  chest: 12,
  shoulders: 6,
  core: 4,
}

const weeks = computed(() =>
  weeklySummaries(history.sessionLogs, history.sets, (id) => {
    try {
      return getExercise(id).primaryMuscles
    } catch {
      return []
    }
  }),
)

const currentWeek = computed(() => weeks.value[0])

const volumeBars = computed<Bar[]>(() =>
  // Oldest week on the left, so the bars read left-to-right in time.
  [...weeks.value]
    .slice(0, 8)
    .reverse()
    .map((w) => ({ label: shortDate(w.weekStart), value: Math.round(w.totalVolumeKg) })),
)

const muscleBars = computed<Bar[]>(() => {
  const counts = currentWeek.value?.setsPerMuscleGroup ?? {}
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([muscle, sets]) => ({
      label: muscle,
      value: sets,
      ...(MUSCLE_TARGETS[muscle] !== undefined ? { target: MUSCLE_TARGETS[muscle] } : {}),
    }))
})

/** Exercises the user has actually logged, so the picker is never a wall of names. */
const loggedExercises = computed(() => {
  const ids = new Set(history.sets.map((s) => s.exerciseId))
  return EXERCISES.filter((e) => ids.has(e.id))
})

const chosen = ref<string>('')
/** Falls back to the first logged exercise until the user picks one. */
const selected = computed<string>({
  get: () => chosen.value || loggedExercises.value[0]?.id || '',
  set: (value) => {
    chosen.value = value
  },
})

const points = computed<LinePoint[]>(() =>
  exerciseHistory(history.sets, history.sessionLogs, selected.value).map((p) => ({
    label: shortDate(p.date),
    value: p.topWeightKg,
    caption: `${p.repsAtTopWeight} reps`,
  })),
)

const best = computed(() => bestSet(history.sets, selected.value))

const orderedLogs = computed(() => history.orderedLogs.slice(0, 20))

function logVolume(logId: string): number {
  return totalVolumeKg(history.setsForLog(logId))
}
</script>

<template>
  <main class="mx-auto min-h-dvh max-w-md p-6">
    <header class="flex items-center justify-between">
      <h1 class="text-3xl font-bold">History</h1>
      <RouterLink to="/" class="min-h-12 px-3 leading-[3rem] text-ink-muted underline">Done</RouterLink>
    </header>

    <p v-if="!ready" class="mt-8 text-ink-muted">Loading…</p>

    <p v-else-if="history.sessionLogs.length === 0" class="mt-8 text-ink-muted">
      Nothing logged yet. Finish a session and it will show up here.
    </p>

    <template v-else>
      <section class="mt-8" aria-labelledby="week-heading">
        <h2 id="week-heading" class="text-sm tracking-wide text-ink-muted uppercase">This week</h2>
        <div class="mt-2 grid grid-cols-2 gap-3">
          <StatTile
            label="Sessions"
            :value="`${currentWeek?.sessionsCompleted ?? 0}`"
            hint="of 4 planned"
          />
          <StatTile label="Sets" :value="`${currentWeek?.totalSets ?? 0}`" />
        </div>
        <div class="mt-3 rounded-xl bg-surface-raised p-4">
          <BarChart
            title="Sets per muscle group"
            :bars="muscleBars"
            :format="(v) => String(v)"
            horizontal
          />
        </div>
      </section>

      <!-- One bar is not a chart. Until there are weeks to compare, the same
           information is a plain number. -->
      <section v-if="volumeBars.length > 1" class="mt-8 rounded-xl bg-surface-raised p-4">
        <BarChart
          :title="`Weekly volume (${units})`"
          :bars="volumeBars"
          :format="(v) => weight(v)"
        />
      </section>
      <section v-else class="mt-3">
        <StatTile
          label="Volume this week"
          :value="weight(currentWeek?.totalVolumeKg ?? 0)"
          :unit="units"
          hint="a trend appears once you have a second week"
        />
      </section>

      <section v-if="loggedExercises.length" class="mt-8" aria-labelledby="exercise-heading">
        <h2 id="exercise-heading" class="text-sm tracking-wide text-ink-muted uppercase">
          Per exercise
        </h2>

        <label class="mt-2 block">
          <span class="sr-only">Choose an exercise</span>
          <select
            v-model="selected"
            class="min-h-12 w-full rounded-xl bg-surface-raised px-3 text-base"
          >
            <option v-for="exercise in loggedExercises" :key="exercise.id" :value="exercise.id">
              {{ exercise.name }}
            </option>
          </select>
        </label>

        <div class="mt-3 rounded-xl bg-surface-raised p-4">
          <LineChart
            :title="`Top set (${units})`"
            :points="points"
            :format="(v) => weight(v)"
          />
        </div>

        <div v-if="best" class="mt-3 grid grid-cols-2 gap-3">
          <StatTile
            label="Best set"
            :value="`${weight(best.weightKg)}`"
            :unit="units"
            :hint="`${best.reps} reps`"
          />
          <StatTile
            label="Est. 1RM"
            :value="weight(estimateOneRepMax(best.weightKg, best.reps))"
            :unit="units"
            hint="Epley estimate"
          />
        </div>
      </section>

      <section class="mt-8" aria-labelledby="sessions-heading">
        <h2 id="sessions-heading" class="text-sm tracking-wide text-ink-muted uppercase">
          Sessions
        </h2>
        <ul class="mt-2 space-y-2">
          <li v-for="log in orderedLogs" :key="log.id">
            <RouterLink
              :to="{ name: 'summary', params: { logId: log.id } }"
              class="flex items-baseline justify-between rounded-xl bg-surface-raised px-4 py-3"
            >
              <span class="text-sm">
                {{ SESSIONS_BY_ID.get(log.sessionId)?.name ?? log.sessionId }}
                <span v-if="!log.completed" class="text-ink-muted">· partial</span>
              </span>
              <span class="tabular text-sm text-ink-muted">
                {{ shortDate(log.startedAt) }} ·
                {{ formatDuration(log.workingTimeMs ?? 0) }} ·
                {{ weight(logVolume(log.id)) }} {{ units }}
              </span>
            </RouterLink>
          </li>
        </ul>
      </section>
    </template>
  </main>
</template>
