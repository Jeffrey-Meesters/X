import { onBeforeUnmount, watch } from 'vue'
import { useSessionStore } from '@/stores/session'
import { clearActiveSession, writeActiveSession } from '@/persistence/db'

/**
 * Autosaves the active session for crash recovery.
 *
 * Saves on every segment transition and every logged set, and deliberately
 * *not* on every tick: a 100ms tick would mean roughly nine thousand writes per
 * session for no extra recoverability, since the position within a segment is
 * reconstructible from its start time (spec section 3.0.1).
 */
export function usePersistence(): void {
  const session = useSessionStore()

  /**
   * Writes run through one chain rather than in parallel.
   *
   * The final tick of a session emits `segment-end` and `complete` together,
   * which meant a save and a clear racing: if the save landed second, a
   * finished workout was still offered for resume on the next cold start.
   * Serialising keeps them in the order they were issued.
   */
  let queue: Promise<unknown> = Promise.resolve()

  function enqueue(operation: () => Promise<unknown>): void {
    // Failures are non-fatal: a workout must never stop because a write did.
    queue = queue.then(operation).catch((error) => {
      console.warn('[persistence] write failed:', error)
    })
  }

  function save(): void {
    // Nothing to recover once the session is over.
    if (session.isComplete) return
    const record = session.persistableRecord()
    if (!record) return
    enqueue(() => writeActiveSession(record))
  }

  function clear(): void {
    enqueue(() => clearActiveSession())
  }

  const stopListening = session.onEvent((event) => {
    if (event.kind === 'segment-start' || event.kind === 'segment-end') save()
    // A finished session has nothing to recover, and leaving the row behind
    // would offer a resume for a workout that is already done.
    if (event.kind === 'complete') clear()
  })

  // Logged sets are the other save point. Watching the count rather than the
  // array contents keeps this to one write per set.
  const stopWatching = watch(
    () => session.loggedSets.length,
    (count, previous) => {
      if (count > previous) save()
    },
  )

  // Pausing is worth persisting too: it is how a plate change starts, and it is
  // exactly when someone might get a phone call.
  const stopPauseWatch = watch(
    () => session.isPaused,
    () => save(),
  )

  // Covers the routes that do not emit a `complete` event, notably ending a
  // session early from the player.
  const stopCompleteWatch = watch(
    () => session.isComplete,
    (complete) => {
      if (complete) clear()
    },
  )

  onBeforeUnmount(() => {
    stopListening()
    stopWatching()
    stopPauseWatch()
    stopCompleteWatch()
  })
}
