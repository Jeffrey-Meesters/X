<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { useSessionRecovery } from '@/composables/useSessionRecovery'
import ResumePrompt from '@/components/ResumePrompt.vue'
import { SESSION_TEMPLATES, PROGRAM } from '@/data/sessions'
import { getExercise } from '@/data/exercises'
import { buildSegmentList, totalDurationMs } from '@/engine/segments'
import { formatDuration } from '@/engine/format'

const router = useRouter()
const recovery = useSessionRecovery()

onMounted(() => void recovery.check())

const nextSession = computed(() => SESSION_TEMPLATES[0]!)

function resumeSession(): void {
  const record = recovery.pending.value
  if (!record) return
  recovery.accept()
  void router.push({
    name: 'player',
    params: { sessionId: record.sessionId },
    query: { resume: '1' },
  })
}

const plannedDuration = computed(() =>
  formatDuration(totalDurationMs(buildSegmentList(nextSession.value, { leadIn: false }))),
)

const circuitExercises = computed(() =>
  nextSession.value.circuit.exercises.map((entry) => getExercise(entry.exerciseId)),
)
</script>

<template>
  <main class="mx-auto flex min-h-dvh max-w-md flex-col p-6">
    <header>
      <h1 class="text-3xl font-bold tracking-tight">{{ PROGRAM.name }}</h1>
      <p class="mt-1 text-ink-muted">{{ PROGRAM.daysPerWeek }} sessions a week</p>
    </header>

    <ResumePrompt
      v-if="recovery.pending.value"
      :record="recovery.pending.value"
      class="mt-8"
      @resume="resumeSession"
      @discard="recovery.discard()"
    />

    <section class="mt-8 rounded-2xl bg-surface-raised p-5">
      <p class="text-sm tracking-wide text-ink-muted uppercase">Next up</p>
      <h2 class="mt-1 text-2xl font-semibold">{{ nextSession.name }}</h2>
      <p class="tabular mt-1 text-ink-muted">{{ plannedDuration }} planned</p>

      <ol class="mt-4 space-y-1 text-sm">
        <li v-for="exercise in circuitExercises" :key="exercise.id">
          {{ exercise.name }}
        </li>
      </ol>
    </section>

    <!-- Primary control sits in the bottom third and is a large tap target. -->
    <div class="mt-auto pt-8">
      <RouterLink
        :to="{ name: 'player', params: { sessionId: nextSession.id } }"
        class="block min-h-16 rounded-2xl bg-work px-6 py-5 text-center text-xl font-semibold text-surface"
      >
        Start {{ nextSession.name }}
      </RouterLink>

      <nav class="mt-4 flex gap-3">
        <RouterLink
          to="/history"
          class="flex min-h-12 flex-1 items-center justify-center rounded-xl bg-surface-raised px-4"
        >
          History
        </RouterLink>
        <RouterLink
          to="/settings"
          class="flex min-h-12 flex-1 items-center justify-center rounded-xl bg-surface-raised px-4"
        >
          Settings
        </RouterLink>
      </nav>
    </div>
  </main>
</template>
