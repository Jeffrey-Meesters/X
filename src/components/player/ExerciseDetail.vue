<script setup lang="ts">
import { ref, watch } from 'vue'
import type { Exercise } from '@/types/models'
import { EXERCISES_BY_ID } from '@/data/exercises'

const props = defineProps<{ exercise: Exercise }>()

/** Collapsed by default: during a set the user should not need to read. */
const open = ref(false)

// Reading cues for one movement then having them stay open over the next is
// noise, so the panel closes itself whenever the exercise changes.
watch(
  () => props.exercise.id,
  () => {
    open.value = false
  },
)

function substitutionName(id: string): string {
  return EXERCISES_BY_ID.get(id)?.name ?? id
}
</script>

<template>
  <div>
    <button
      type="button"
      class="min-h-12 w-full rounded-xl bg-surface-raised px-4 text-sm font-medium"
      :aria-expanded="open"
      @click="open = !open"
    >
      {{ open ? 'Hide' : 'Form cues, mistakes and swaps' }}
    </button>

    <div v-if="open" class="mt-3 space-y-4 rounded-xl bg-surface-raised p-4 text-sm">
      <section>
        <h3 class="font-semibold">Cues</h3>
        <ul class="mt-1 list-disc space-y-0.5 pl-5 text-ink-muted">
          <li v-for="cue in exercise.cues" :key="cue">{{ cue }}</li>
        </ul>
      </section>

      <section>
        <h3 class="font-semibold">Common mistakes</h3>
        <ul class="mt-1 list-disc space-y-0.5 pl-5 text-ink-muted">
          <li v-for="mistake in exercise.commonMistakes" :key="mistake">{{ mistake }}</li>
        </ul>
      </section>

      <section>
        <h3 class="font-semibold">Muscles worked</h3>
        <p class="mt-1 text-ink-muted">
          {{ exercise.primaryMuscles.join(', ') }}
          <template v-if="exercise.secondaryMuscles.length">
            &middot; {{ exercise.secondaryMuscles.join(', ') }}
          </template>
        </p>
      </section>

      <section v-if="exercise.substitutions.length">
        <h3 class="font-semibold">Substitutions</h3>
        <p class="mt-1 text-ink-muted">
          {{ exercise.substitutions.map(substitutionName).join(', ') }}
        </p>
      </section>
    </div>
  </div>
</template>
