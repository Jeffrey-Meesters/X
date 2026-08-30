<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useHistoryStore } from '@/stores/history'
import { useSettingsStore } from '@/stores/settings'
import { getExercise } from '@/data/exercises'
import { getSessionTemplate } from '@/data/sessions'
import { summariseSession } from '@/engine/summary'
import { prefillWeightKg, suggestProgression } from '@/engine/progression'
import { formatDuration } from '@/engine/format'
import { formatWeight } from '@/engine/units'
import StatTile from '@/components/charts/StatTile.vue'
import ProgressionNudge from '@/components/ProgressionNudge.vue'

/** Post-session summary and progression nudges (spec sections 3.4 and 10). */
const route = useRoute()
const history = useHistoryStore()
const settingsStore = useSettingsStore()

const logId = computed(() => String(route.params.logId))
const ready = ref(false)

onMounted(async () => {
  await history.load()
  ready.value = true
})

const log = computed(() => history.sessionLogs.find((l) => l.id === logId.value))
const sets = computed(() => history.setsForLog(logId.value))
const units = computed(() => settingsStore.settings.units)

const template = computed(() => {
  try {
    return log.value ? getSessionTemplate(log.value.sessionId) : undefined
  } catch {
    return undefined
  }
})

/**
 * What this session was planned with, not what the settings say now. A log
 * written before rounds were customisable carries no value, and three was the
 * only possibility then.
 */
const plannedRounds = computed(() => log.value?.rounds ?? 3)

const summary = computed(() =>
  summariseSession(
    sets.value,
    (id) => template.value?.circuit.exercises.find((e) => e.exerciseId === id)?.targetReps,
    () => plannedRounds.value,
  ),
)

/**
 * Only sessions before this one count toward the ramp-up window, so finishing
 * a session does not immediately change how its own nudges are calculated.
 */
const priorSessions = computed(
  () => history.sessionLogs.filter((l) => l.completed && l.id !== logId.value).length,
)

const nudges = computed(() =>
  summary.value.cleared
    .map((outcome) => {
      const range = template.value?.circuit.exercises.find(
        (e) => e.exerciseId === outcome.exerciseId,
      )?.targetReps
      if (!range) return undefined

      // Whether the pre-fill was left alone is not stored on a set, but it is
      // recoverable: the pre-fill was whatever the previous session would have
      // offered, so a lifted weight equal to it means the user never changed
      // it. A weight they raised by hand is already their own judgement and
      // does not earn the doubled first-sessions step.
      const previous = history.lastSessionSetsFor(outcome.exerciseId, logId.value)
      const wouldHavePrefilled = prefillWeightKg({
        lastSessionSets: previous,
        units: units.value,
      })

      const suggestion = suggestProgression({
        sets: outcome.sets,
        targetReps: range,
        rounds: plannedRounds.value,
        units: units.value,
        increment: settingsStore.settings.weightIncrement,
        completedSessionCount: priorSessions.value,
        prefillUntouched: outcome.topWeightKg === wouldHavePrefilled,
      })
      return suggestion ? { exerciseId: outcome.exerciseId, ...suggestion } : undefined
    })
    .filter((n): n is NonNullable<typeof n> => n !== undefined),
)

const decisions = ref<Record<string, 'accepted' | 'declined'>>({})

async function accept(exerciseId: string, weightKg: number): Promise<void> {
  decisions.value = { ...decisions.value, [exerciseId]: 'accepted' }
  await history.acceptProgression(exerciseId, weightKg)
}

function decline(exerciseId: string): void {
  decisions.value = { ...decisions.value, [exerciseId]: 'declined' }
}

const workingTime = computed(() => formatDuration(log.value?.workingTimeMs ?? 0))
const totalElapsed = computed(() => formatDuration(log.value?.totalElapsedMs ?? 0))
const paused = computed(
  () => (log.value?.totalElapsedMs ?? 0) - (log.value?.workingTimeMs ?? 0) > 1000,
)
</script>

<template>
  <main class="mx-auto min-h-dvh max-w-md p-6">
    <div v-if="!ready" class="text-ink-muted">Loading…</div>

    <div v-else-if="!log" class="text-ink-muted">
      <p>That session could not be found.</p>
      <RouterLink to="/" class="mt-4 inline-block underline">Back home</RouterLink>
    </div>

    <template v-else>
      <header>
        <h1 class="text-3xl font-bold">{{ template?.name ?? 'Session' }} done</h1>
        <p class="mt-1 text-ink-muted">
          {{ log.completed ? 'Completed' : 'Ended early' }} ·
          {{ new Date(log.startedAt).toLocaleDateString() }}
        </p>
      </header>

      <section class="mt-6 grid grid-cols-2 gap-3">
        <StatTile
          label="Working time"
          :value="workingTime"
          :hint="paused ? `${totalElapsed} including pauses` : undefined"
        />
        <StatTile label="Sets" :value="String(summary.setsCompleted)" />
        <StatTile
          label="Volume"
          :value="formatWeight(summary.totalVolumeKg, units)"
          :unit="units"
          hint="weight × reps"
        />
        <StatTile
          label="Range cleared"
          :value="String(summary.cleared.length)"
          :hint="summary.cleared.length === 1 ? 'exercise' : 'exercises'"
        />
      </section>

      <section v-if="nudges.length" class="mt-8" aria-labelledby="nudge-heading">
        <h2 id="nudge-heading" class="text-sm tracking-wide text-ink-muted uppercase">
          Next time
        </h2>
        <div class="mt-2 space-y-3">
          <ProgressionNudge
            v-for="nudge in nudges"
            :key="nudge.exerciseId"
            :exercise-id="nudge.exerciseId"
            :current-weight-kg="nudge.currentWeightKg"
            :suggested-weight-kg="nudge.suggestedWeightKg"
            :steps="nudge.steps"
            :units="units"
            :decided="decisions[nudge.exerciseId]"
            @accept="accept(nudge.exerciseId, nudge.suggestedWeightKg)"
            @decline="decline(nudge.exerciseId)"
          />
        </div>
      </section>

      <section class="mt-8" aria-labelledby="sets-heading">
        <h2 id="sets-heading" class="text-sm tracking-wide text-ink-muted uppercase">
          What you lifted
        </h2>
        <ul class="mt-2 space-y-2">
          <li
            v-for="outcome in summary.exercises"
            :key="outcome.exerciseId"
            class="flex items-baseline justify-between rounded-xl bg-surface-raised px-4 py-3"
          >
            <span class="text-sm">{{ getExercise(outcome.exerciseId).name }}</span>
            <span class="tabular text-sm text-ink-muted">
              {{ formatWeight(outcome.topWeightKg, units) }} {{ units }} ·
              {{ outcome.totalReps }} reps
            </span>
          </li>
        </ul>
      </section>

      <div class="mt-8 flex gap-3">
        <RouterLink
          to="/"
          class="flex min-h-14 flex-1 items-center justify-center rounded-xl bg-work font-semibold text-surface"
        >
          Done
        </RouterLink>
        <RouterLink
          to="/history"
          class="flex min-h-14 flex-1 items-center justify-center rounded-xl bg-surface-raised font-semibold"
        >
          History
        </RouterLink>
      </div>
    </template>
  </main>
</template>
