import type { SessionLog } from '@/types/models'

/**
 * Which session comes next, from history (spec section 3.1).
 *
 * This module is pure TypeScript with no Vue or Pinia dependency.
 */

/**
 * The session after the most recently *completed* one, rotating through the
 * program's order.
 *
 * Completion is the deliberate part. A session abandoned after ninety seconds
 * is not one the user has done, and rotating past it would quietly drop it
 * from the week - so a partial leaves the rotation exactly where it was, and
 * the home screen's manual override covers the cases where they disagree.
 */
export function nextSessionId(
  logs: readonly SessionLog[],
  order: readonly string[],
): string | undefined {
  const first = order[0]
  if (first === undefined) return undefined

  const lastCompleted = [...logs]
    .filter((log) => log.completed)
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    .at(-1)
  if (!lastCompleted) return first

  const position = order.indexOf(lastCompleted.sessionId)
  // A session that is no longer in the program - renamed, or from an import
  // of an older build - restarts the rotation rather than throwing.
  if (position === -1) return first

  return order[(position + 1) % order.length]
}
