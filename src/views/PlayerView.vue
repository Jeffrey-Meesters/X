<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSessionStore } from '@/stores/session'
import { useSessionRunner } from '@/composables/useSessionRunner'
import { usePersistence } from '@/composables/usePersistence'
import { readActiveSession } from '@/persistence/db'
import { useHistoryStore } from '@/stores/history'
import { formatDuration, formatRepRange } from '@/engine/format'
import { formatWeight, totalVolumeKg } from '@/engine/units'
import { useSettingsStore } from '@/stores/settings'
import { getSessionTemplate } from '@/data/sessions'
import ExerciseFigure from '@/components/animations/ExerciseFigure.vue'
import SegmentBanner from '@/components/player/SegmentBanner.vue'
import CountdownDisplay from '@/components/player/CountdownDisplay.vue'
import PlayerControls from '@/components/player/PlayerControls.vue'
import ExerciseDetail from '@/components/player/ExerciseDetail.vue'
import SetEntry from '@/components/player/SetEntry.vue'

const route = useRoute()
const router = useRouter()
const session = useSessionStore()
const settingsStore = useSettingsStore()

useSessionRunner()
usePersistence()

const templateId = computed(() => String(route.params.sessionId))

onMounted(async () => {
  // Guard an unknown id from the URL rather than throwing on a bad bookmark.
  try {
    getSessionTemplate(templateId.value)
  } catch {
    void router.replace('/')
    return
  }

  // History has to be loaded before the first weight entry opens, or the
  // pre-fill would fall back to the calibration floor on a user who has months
  // of sessions behind them.
  await useHistoryStore().load()

  // ?resume=1 is set by the recovery prompt on the home screen.
  if (route.query.resume === '1') {
    const record = await readActiveSession().catch(() => undefined)
    if (record && record.sessionId === templateId.value) {
      session.restoreFrom(record)
      return
    }
  }

  session.start(templateId.value)
})

onBeforeUnmount(() => session.reset())

const segment = computed(() => session.currentSegment)
const exercise = computed(() => session.currentExercise)

const isRest = computed(
  () => segment.value?.type === 'transition' || segment.value?.type === 'lead-in',
)
const canExtend = computed(() => session.isActive && isRest.value)

const roundLabel = computed(() => {
  const current = segment.value
  if (!current?.round || !current.totalRounds) return ''
  return `Round ${current.round} of ${current.totalRounds}`
})

const targetLabel = computed(() => {
  const current = segment.value
  if (!current?.targetReps) return ''
  const perSide = exercise.value?.unilateral === true ? ' per side' : ''
  return `${formatRepRange(current.targetReps)} reps${perSide}`
})

const sideLabel = computed(() => (segment.value?.side ? `${segment.value.side} side` : ''))

/**
 * Screen-reader announcement at each segment change. Kept to one short line so
 * it does not still be reading when the interval is already over.
 */
const announcement = computed(() => {
  if (!segment.value || !exercise.value) return ''
  if (session.isPaused) return 'Paused'
  const parts = [segment.value.type === 'transition' ? 'Rest' : exercise.value.name]
  if (roundLabel.value) parts.push(roundLabel.value)
  if (sideLabel.value) parts.push(sideLabel.value)
  return parts.join('. ')
})

const completedLabel = computed(() => {
  const current = session.snapshot
  if (!current) return ''
  // Working time and total elapsed diverge whenever the user paused to change
  // plates, so the summary reports them separately (spec section 6.5).
  const working = formatDuration(current.workingTimeMs)
  const total = formatDuration(current.totalElapsedMs)
  return working === total ? `${working} of work` : `${working} of work, ${total} elapsed`
})

const volumeLabel = computed(() => {
  const sets = session.loggedSets
  if (sets.length === 0) return 'No sets logged'
  const volume = totalVolumeKg(sets)
  const units = settingsStore.settings.units
  return `${sets.length} sets \u00b7 ${formatWeight(volume, units)} ${units} total volume`
})

function endSession(): void {
  session.end()
  void router.replace('/')
}
</script>

<template>
  <main class="mx-auto flex h-dvh max-w-md flex-col p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
    <div v-if="!segment || !exercise" class="m-auto text-ink-muted">Loading session…</div>

    <!-- The full summary lands in a later milestone; for now finishing has to
         be an explicit, acknowledged state rather than a stalled countdown. -->
    <section v-else-if="session.isComplete" class="m-auto text-center">
      <h1 class="text-4xl font-bold">Session complete</h1>
      <p data-testid="completed-label" class="mt-3 text-ink-muted">{{ completedLabel }}</p>
      <p class="mt-1 text-ink-muted" data-testid="completed-volume">{{ volumeLabel }}</p>
      <button
        type="button"
        class="mt-8 min-h-16 w-full rounded-2xl bg-work px-6 text-xl font-semibold text-surface"
        @click="router.replace('/')"
      >
        Done
      </button>
    </section>

    <template v-else>
      <!-- Politeness level matters: assertive would cut off the countdown at
           every segment boundary. -->
      <p aria-live="polite" class="sr-only" data-testid="announcement">{{ announcement }}</p>

      <header class="flex items-center justify-between gap-3">
        <SegmentBanner :type="segment.type" :paused="session.isPaused" />
        <button
          type="button"
          class="min-h-12 rounded-xl px-4 text-sm font-medium text-ink-muted"
          @click="endSession"
        >
          End
        </button>
      </header>

      <div
        class="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-raised"
        role="progressbar"
        :aria-valuenow="Math.round(session.progress * 100)"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-label="Session progress"
      >
        <div class="h-full bg-ink-muted transition-[width]" :style="{ width: `${session.progress * 100}%` }" />
      </div>

      <section class="mt-4 text-center">
        <h1 class="text-3xl leading-tight font-bold">{{ exercise.name }}</h1>
        <p class="mt-1 min-h-6 text-ink-muted">
          <span v-if="isRest && session.nextExercise" data-testid="next-up">Next: {{ session.nextExercise.name }}</span>
          <span v-else-if="targetLabel" data-testid="target">{{ targetLabel }}</span>
          <span v-else-if="sideLabel" class="capitalize">{{ sideLabel }}</span>
        </p>
        <p v-if="roundLabel" data-testid="round" class="mt-0.5 text-sm text-ink-muted">{{ roundLabel }}</p>
      </section>

      <!-- During a rest the weight entry replaces the illustration: the user is
           looking at the phone anyway, and the countdown keeps running beside
           it (spec section 3.3). -->
      <div v-if="session.draft" class="min-h-0 flex-1 overflow-y-auto py-2">
        <SetEntry
          :draft="session.draft"
          @adjust-weight="session.adjustWeight($event)"
          @set-weight="session.setWeightFromDisplay($event)"
          @adjust-reps="session.adjustReps($event)"
          @set-rir="session.setRir($event)"
          @next="session.commitAndAdvance()"
        />
      </div>

      <div v-else class="flex min-h-0 flex-1 items-center justify-center py-2">
        <ExerciseFigure
          :exercise-id="segment.exerciseId"
          :paused="session.isPaused"
          class="mx-auto h-full max-h-48"
        />
      </div>

      <!-- The countdown is sized to be read from ~2m with the phone on the
           floor. While logging a set the user is holding it, so it shrinks to
           leave room for the entry's own Next button. -->
      <CountdownDisplay
        :remaining-ms="session.snapshot?.remainingMs ?? 0"
        :dimmed="session.isPaused"
        :compact="session.draft !== null"
      />

      <!-- Everything interactive lives in the bottom third, reachable one-handed. -->
      <div class="mt-auto space-y-3 pt-4">
        <ExerciseDetail v-if="!session.draft" :exercise="exercise" />
        <PlayerControls
          :paused="session.isPaused"
          :can-extend="canExtend"
          @toggle-pause="session.togglePause()"
          @skip-back="session.skipBack()"
          @skip-forward="session.skipForward()"
          @extend="session.extend($event)"
        />
      </div>
    </template>
  </main>
</template>
