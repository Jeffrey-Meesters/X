import { describe, it, expect, beforeEach } from 'vitest'
import { applyStoredTheme, applyTheme, resolveTheme } from './useTheme'

describe('resolveTheme', () => {
  it('takes an explicit choice over the system preference', () => {
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })

  it('follows the system on auto', () => {
    expect(resolveTheme('auto', true)).toBe('dark')
    expect(resolveTheme('auto', false)).toBe('light')
  })
})

describe('applyTheme', () => {
  beforeEach(() => {
    document.documentElement.className = ''
  })

  it('sets exactly one of the two classes', () => {
    applyTheme('light')
    expect(document.documentElement.classList.contains('light')).toBe(true)
    expect(document.documentElement.classList.contains('dark')).toBe(false)

    applyTheme('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(document.documentElement.classList.contains('light')).toBe(false)
  })
})

describe('applyStoredTheme', () => {
  beforeEach(() => {
    document.documentElement.className = 'dark'
    localStorage.clear()
  })

  it('applies a stored choice before anything Vue has run', () => {
    // The document ships as `class="dark"`; this is what stops a light-theme
    // user seeing a dark frame painted and then swapped on every cold start.
    localStorage.setItem('fullbody15.settings', JSON.stringify({ theme: 'light' }))
    applyStoredTheme()
    expect(document.documentElement.classList.contains('light')).toBe(true)
  })

  it('ignores a stored value that is not a theme', () => {
    localStorage.setItem('fullbody15.settings', JSON.stringify({ theme: 'neon' }))
    expect(() => applyStoredTheme()).not.toThrow()
  })

  it('survives corrupt storage rather than taking the app down on boot', () => {
    localStorage.setItem('fullbody15.settings', 'not json')
    expect(() => applyStoredTheme()).not.toThrow()
  })
})
