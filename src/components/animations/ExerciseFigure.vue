<script setup lang="ts">
import { computed } from 'vue'
import { getExercise } from '@/data/exercises'
import { resolveAnimation } from './resolve'

/**
 * Renders the movement animation for an exercise.
 *
 * A thin dispatcher: it looks up the exercise's animation id and hands off to
 * the hand-authored component, falling back to a generic figure for any
 * exercise that does not have its own drawing yet.
 */
const props = defineProps<{ exerciseId: string; paused?: boolean }>()

const exercise = computed(() => getExercise(props.exerciseId))
const component = computed(() => resolveAnimation(exercise.value.animation.id))
</script>

<template>
  <component :is="component" :exercise-id="exerciseId" :paused="paused" />
</template>
