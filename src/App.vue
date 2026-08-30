<script setup lang="ts">
import { RouterView } from 'vue-router'
import UpdatePrompt from '@/components/UpdatePrompt.vue'
import { useTheme } from '@/composables/useTheme'

// Mounted once for the whole app: the root element's theme class is global
// state, and two watchers fighting over it would be worse than one.
useTheme()
</script>

<template>
  <RouterView />
  <UpdatePrompt />
</template>
