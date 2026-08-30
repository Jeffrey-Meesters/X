import { describe, it, expect } from 'vitest'
import { nextSessionId } from './rotation'
import type { SessionLog } from '@/types/models'

const ORDER = ['session-a', 'session-b']

function log(sessionId: string, startedAt: string, completed = true): SessionLog {
  return {
    id: `log-${startedAt}`,
    programId: 'fullbody-15',
    sessionId,
    startedAt,
    endedAt: startedAt,
    completed,
    sets: [],
  }
}

describe('nextSessionId', () => {
  it('starts at the first session when there is no history', () => {
    expect(nextSessionId([], ORDER)).toBe('session-a')
  })

  it('alternates from the most recent completed session', () => {
    expect(nextSessionId([log('session-a', '2026-08-20T09:00:00Z')], ORDER)).toBe('session-b')
    expect(nextSessionId([log('session-b', '2026-08-22T09:00:00Z')], ORDER)).toBe('session-a')
  })

  it('wraps around the end of the program order', () => {
    expect(nextSessionId([log('session-b', '2026-08-22T09:00:00Z')], ORDER)).toBe(ORDER[0])
  })

  it('reads the latest by date, not by array position', () => {
    const outOfOrder = [
      log('session-b', '2026-08-22T09:00:00Z'),
      log('session-a', '2026-08-20T09:00:00Z'),
    ]
    expect(nextSessionId(outOfOrder, ORDER)).toBe('session-a')
  })

  it('leaves the rotation where it was when the last session was abandoned', () => {
    // Someone who quit Session A after ninety seconds has not done Session A,
    // and rotating past it would drop it from their week entirely.
    const logs = [
      log('session-b', '2026-08-20T09:00:00Z'),
      log('session-a', '2026-08-22T09:00:00Z', false),
    ]
    expect(nextSessionId(logs, ORDER)).toBe('session-a')
  })

  it('restarts rather than throwing on a session id the program no longer has', () => {
    expect(nextSessionId([log('session-legacy', '2026-08-20T09:00:00Z')], ORDER)).toBe('session-a')
  })

  it('returns nothing for an empty program', () => {
    expect(nextSessionId([], [])).toBeUndefined()
  })
})
