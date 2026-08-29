<script setup lang="ts">
defineProps<{ paused: boolean; canExtend: boolean }>()

const emit = defineEmits<{
  togglePause: []
  skipBack: []
  skipForward: []
  extend: [ms: number]
}>()
</script>

<template>
  <div class="space-y-3">
    <!-- +15s / +30s sit above the main row so a mis-tap under fatigue hits a
         rest extension rather than the pause. -->
    <div v-if="canExtend" class="flex gap-3">
      <button
        type="button"
        class="min-h-12 flex-1 rounded-xl bg-surface-raised text-base font-semibold"
        @click="emit('extend', 15_000)"
      >
        +15s
      </button>
      <button
        type="button"
        class="min-h-12 flex-1 rounded-xl bg-surface-raised text-base font-semibold"
        @click="emit('extend', 30_000)"
      >
        +30s
      </button>
    </div>

    <div class="flex items-stretch gap-3">
      <button
        type="button"
        class="min-h-20 w-20 shrink-0 rounded-2xl bg-surface-raised text-2xl"
        aria-label="Previous segment"
        @click="emit('skipBack')"
      >
        &#9664;&#9664;
      </button>

      <!--
        The pause target is deliberately the largest thing on the screen and is
        never behind a menu: it is the mechanism for changing plates on
        adjustable dumbbells, used one-handed with sweaty hands (spec 3.2).
      -->
      <button
        type="button"
        class="min-h-20 flex-1 rounded-2xl text-2xl font-bold"
        :class="paused ? 'bg-work text-surface' : 'bg-ink text-surface'"
        :aria-label="paused ? 'Resume session' : 'Pause session'"
        @click="emit('togglePause')"
      >
        {{ paused ? 'Resume' : 'Pause' }}
      </button>

      <button
        type="button"
        class="min-h-20 w-20 shrink-0 rounded-2xl bg-surface-raised text-2xl"
        aria-label="Next segment"
        @click="emit('skipForward')"
      >
        &#9654;&#9654;
      </button>
    </div>
  </div>
</template>
