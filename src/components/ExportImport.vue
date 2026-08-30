<script setup lang="ts">
import { computed, nextTick, onMounted, ref, useTemplateRef } from 'vue'
import { useHistoryStore } from '@/stores/history'
import { useSettingsStore } from '@/stores/settings'
import { replaceAll } from '@/persistence/db'
import {
  buildExportFile,
  exportFilename,
  parseImport,
  type ExportFile,
  type ImportCounts,
} from '@/persistence/exportImport'

/**
 * Export and import, the only way data moves between devices (spec section 8).
 *
 * Import **replaces** local data rather than merging it. The app is
 * single-user, single-device by design, so the case it has to serve is moving
 * to a new phone - and a merge would answer a multi-device question the app
 * does not have while quietly producing a history that never happened on any
 * one device. The cost of replace is that it can destroy history, so it is
 * spent behind a confirmation that says exactly what is about to go.
 */
const historyStore = useHistoryStore()
const settingsStore = useSettingsStore()

type Stage =
  | { kind: 'idle' }
  | { kind: 'confirming'; file: ExportFile; counts: ImportCounts }
  | { kind: 'failed'; message: string }
  | { kind: 'done'; counts: ImportCounts }

const stage = ref<Stage>({ kind: 'idle' })
const fileInput = useTemplateRef<HTMLInputElement>('fileInput')
const cancelButton = useTemplateRef<HTMLButtonElement>('cancelButton')

const localSessions = computed(() => historyStore.sessionLogs.length)

/**
 * Settings is reachable directly, so history may not have been read yet - and
 * an export taken before it lands would be a valid, empty file, which is the
 * worst possible bug in a backup feature. The button stays disabled until the
 * mirror is populated.
 */
onMounted(() => void historyStore.load())
const ready = computed(() => historyStore.loaded)

/**
 * Built from the in-memory mirror, not by reading IndexedDB.
 *
 * That keeps the whole export synchronous, which is what lets it run inside
 * the click's user gesture - Safari drops the gesture across an await, and
 * without one `navigator.share` is refused outright.
 */
function currentExport(): ExportFile {
  return buildExportFile({
    settings: settingsStore.settings,
    sessionLogs: historyStore.sessionLogs,
    sets: historyStore.sets,
    progressionTargets: historyStore.targets,
  })
}

function exportData(): void {
  const json = JSON.stringify(currentExport(), null, 2)
  const name = exportFilename()
  const file = new File([json], name, { type: 'application/json' })

  // The share sheet first where it exists. On an iOS home-screen app a plain
  // `<a download>` has nowhere to put the file - Safari opens the JSON in a
  // tab instead - and sharing to Files is the only way off the device.
  if (navigator.canShare?.({ files: [file] })) {
    void navigator.share({ files: [file], title: name }).catch(() => {
      // Cancelling the sheet rejects. Nothing to report; they know.
    })
    return
  }

  // Appended, and revoked on a later task rather than immediately. A detached
  // anchor does not reliably start a download in every browser, and revoking
  // the object URL in the same task as the click can cancel the download
  // before it has read from it.
  const url = URL.createObjectURL(file)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.style.display = 'none'
  document.body.append(anchor)
  anchor.click()
  setTimeout(() => {
    anchor.remove()
    URL.revokeObjectURL(url)
  }, 0)
}

async function onFileChosen(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const chosen = input.files?.[0]
  // Reset immediately so choosing the same file twice fires `change` again.
  input.value = ''
  if (!chosen) return

  const result = parseImport(await chosen.text())
  if (!result.ok) {
    stage.value = { kind: 'failed', message: result.error }
    return
  }

  stage.value = { kind: 'confirming', file: result.file, counts: result.counts }
  await nextTick()
  // Focus lands on Cancel, not on Replace. Focus has to move into the dialog
  // so it is announced and reachable, but parking it on the button that
  // destroys someone's training history means a stray Enter does it.
  cancelButton.value?.focus()
}

async function confirmImport(): Promise<void> {
  if (stage.value.kind !== 'confirming') return
  const { file, counts } = stage.value

  try {
    await replaceAll({
      sessionLogs: file.sessionLogs,
      sets: file.sets,
      progressionTargets: file.progressionTargets,
    })
  } catch (error) {
    console.warn('[import] could not write imported data:', error)
    stage.value = {
      kind: 'failed',
      message: 'Could not write to storage, so nothing was changed.',
    }
    return
  }

  // Only after the write commits. Settings last, because they are the part
  // that cannot be rolled back - and applying them over a failed import would
  // leave the app describing data it does not have.
  settingsStore.update(file.settings)
  historyStore.reset()
  await historyStore.load()

  stage.value = { kind: 'done', counts }
}
</script>

<template>
  <section aria-labelledby="data-heading">
    <h2 id="data-heading" class="text-sm tracking-wide text-ink-muted uppercase">Your data</h2>

    <button
      type="button"
      class="mt-2 min-h-14 w-full rounded-xl bg-surface-raised px-4 text-left text-lg disabled:opacity-50"
      data-testid="export-button"
      :disabled="!ready"
      @click="exportData"
    >
      Export to a file
    </button>

    <button
      type="button"
      class="mt-3 min-h-14 w-full rounded-xl bg-surface-raised px-4 text-left text-lg disabled:opacity-50"
      data-testid="import-button"
      :disabled="!ready"
      @click="fileInput?.click()"
    >
      Import from a file
    </button>
    <input
      ref="fileInput"
      type="file"
      accept="application/json,.json"
      class="sr-only"
      data-testid="import-input"
      @change="onFileChosen"
    />

    <p class="mt-2 text-sm text-ink-muted">
      Everything stays on this device. An export is a plain JSON file holding
      your history and settings - it is how you move to a new phone.
    </p>

    <div
      v-if="stage.kind === 'confirming'"
      class="mt-3 rounded-xl border border-warmup/50 bg-surface-raised p-4"
      role="alertdialog"
      aria-labelledby="import-confirm-heading"
      data-testid="import-confirm"
    >
      <h3 id="import-confirm-heading" class="font-semibold">Replace everything on this device?</h3>
      <p class="mt-2 text-sm">
        <template v-if="localSessions > 0">
          This deletes
          <strong>{{ localSessions }}</strong>
          {{ localSessions === 1 ? 'session' : 'sessions' }} recorded here and installs
          <strong>{{ stage.counts.sessions }}</strong>
          from the file. It cannot be undone.
        </template>
        <template v-else>
          There is no history on this device yet. This installs
          <strong>{{ stage.counts.sessions }}</strong>
          {{ stage.counts.sessions === 1 ? 'session' : 'sessions' }} and
          <strong>{{ stage.counts.sets }}</strong>
          {{ stage.counts.sets === 1 ? 'set' : 'sets' }} from the file.
        </template>
      </p>
      <div class="mt-4 flex gap-3">
        <button
          ref="cancelButton"
          type="button"
          class="min-h-14 flex-1 rounded-xl bg-surface px-4 text-lg"
          @click="stage = { kind: 'idle' }"
        >
          Cancel
        </button>
        <!-- Styled as destructive rather than as the primary action: it is the
             only control in the app that can lose data, and the safe way out
             should not be the quieter of the two. -->
        <button
          type="button"
          class="min-h-14 flex-1 rounded-xl bg-danger px-4 text-lg font-semibold text-surface"
          data-testid="import-confirm-button"
          @click="confirmImport"
        >
          Replace
        </button>
      </div>
    </div>

    <p
      v-else-if="stage.kind === 'failed'"
      class="mt-3 rounded-xl border border-danger/60 bg-surface-raised p-4 text-sm"
      role="alert"
      data-testid="import-error"
    >
      {{ stage.message }} Nothing on this device was changed.
    </p>

    <p
      v-else-if="stage.kind === 'done'"
      class="mt-3 rounded-xl bg-surface-raised p-4 text-sm"
      role="status"
      data-testid="import-done"
    >
      Imported {{ stage.counts.sessions }}
      {{ stage.counts.sessions === 1 ? 'session' : 'sessions' }} and
      {{ stage.counts.sets }} {{ stage.counts.sets === 1 ? 'set' : 'sets' }}.
    </p>
  </section>
</template>
