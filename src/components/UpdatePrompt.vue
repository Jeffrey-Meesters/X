<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAppUpdate } from '@/composables/useAppUpdate'
import { useSessionStore } from '@/stores/session'

/**
 * Offers the waiting service worker, on a tap.
 *
 * Deliberately never shown during a session. Taking an update reloads the
 * page, and a reload landing mid-set - phone on the floor, hands full - is the
 * worst possible moment even though the recovery row would survive it. The new
 * worker keeps waiting; the prompt reappears the moment the session ends.
 */
const { needRefresh, updateServiceWorker } = useAppUpdate()
const sessionStore = useSessionStore()

const dismissed = ref(false)
const visible = computed(() => needRefresh.value && !dismissed.value && !sessionStore.isActive)

function reload(): void {
  void updateServiceWorker()
}
</script>

<template>
  <div
    v-if="visible"
    class="fixed inset-x-0 bottom-0 z-50 p-3"
    role="status"
    data-testid="update-prompt"
  >
    <div
      class="mx-auto flex max-w-md items-center gap-3 rounded-xl bg-surface-raised p-3 shadow-lg"
    >
      <p class="flex-1 text-sm">A new version is ready.</p>
      <button
        type="button"
        class="min-h-12 rounded-lg px-3 text-sm text-ink-muted"
        @click="dismissed = true"
      >
        Later
      </button>
      <button
        type="button"
        class="min-h-12 rounded-lg bg-ink px-4 font-semibold text-surface"
        data-testid="update-reload"
        @click="reload"
      >
        Reload
      </button>
    </div>
  </div>
</template>
