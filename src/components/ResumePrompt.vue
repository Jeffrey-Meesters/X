<script setup lang="ts">
import { computed } from 'vue'
import type { ActiveSessionRecord } from '@/persistence/db'
import { getSessionTemplate } from '@/data/sessions'
import { formatDuration } from '@/engine/format'

const props = defineProps<{ record: ActiveSessionRecord }>()
defineEmits<{ resume: []; discard: [] }>()

const sessionName = computed(() => {
  try {
    return getSessionTemplate(props.record.sessionId).name
  } catch {
    return 'Session'
  }
})

const progress = computed(() => formatDuration(props.record.workingTimeMs))
const setCount = computed(() => props.record.setsLogged.length)
</script>

<template>
  <section
    class="rounded-2xl border border-rest/40 bg-surface-raised p-5"
    aria-labelledby="resume-heading"
  >
    <h2 id="resume-heading" class="text-xl font-semibold">Unfinished {{ sessionName }}</h2>
    <p class="mt-1 text-ink-muted">
      {{ progress }} in<template v-if="setCount"> · {{ setCount }} sets logged</template>
    </p>
    <!-- Resuming always lands paused, so nothing starts counting down before
         the user is back on the floor and ready. -->
    <p class="mt-2 text-sm text-ink-muted">It will come back paused.</p>

    <div class="mt-4 flex gap-3">
      <button
        type="button"
        class="min-h-14 flex-1 rounded-xl bg-work text-lg font-semibold text-surface"
        @click="$emit('resume')"
      >
        Resume
      </button>
      <button
        type="button"
        class="min-h-14 flex-1 rounded-xl bg-surface text-lg font-semibold"
        @click="$emit('discard')"
      >
        Discard
      </button>
    </div>
  </section>
</template>
