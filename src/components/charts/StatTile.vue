<script setup lang="ts">
// `| undefined` explicitly: exactOptionalPropertyTypes distinguishes "absent"
// from "present and undefined", and callers pass a conditional hint.
defineProps<{
  label: string
  value: string
  unit?: string | undefined
  hint?: string | undefined
}>()
</script>

<template>
  <div class="rounded-xl bg-surface-raised p-4">
    <p class="text-xs tracking-wide text-ink-muted uppercase">{{ label }}</p>
    <!--
      Deliberately not `tabular-nums`: equal-width digits make a large standalone
      figure look gappy. The countdown uses them because it changes every second
      and would otherwise jitter; a static number has no such problem.
    -->
    <p class="mt-1 text-3xl leading-none font-bold">
      {{ value }}<span v-if="unit" class="ml-1 text-base font-medium text-ink-muted">{{ unit }}</span>
    </p>
    <p v-if="hint" class="mt-1 text-xs text-ink-muted">{{ hint }}</p>
  </div>
</template>
