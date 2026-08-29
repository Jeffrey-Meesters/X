<script setup lang="ts">
import { computed } from 'vue'
import { formatCountdown } from '@/engine/format'

const props = defineProps<{ remainingMs: number; dimmed: boolean }>()

const display = computed(() => formatCountdown(props.remainingMs))
</script>

<template>
  <!-- Sized in viewport units so it stays legible at arm's length from the
       floor. Tabular figures stop it jittering as digits change width. -->
  <p
    data-testid="countdown"
    class="tabular text-center leading-none font-black tracking-tighter transition-opacity"
    :class="dimmed ? 'opacity-40' : 'opacity-100'"
    style="font-size: var(--text-countdown)"
  >
    {{ display }}
  </p>
</template>
