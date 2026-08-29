import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { EXERCISES } from '@/data/exercises'

/**
 * Sixteen hand-authored SVGs have to keep looking like one set as they are
 * edited. These assert the authoring convention from spec section 4 directly
 * against the source files, which is the only thing that stops the set drifting
 * one well-meaning tweak at a time.
 */
const DIR = join(process.cwd(), 'src/components/animations/moves')
const FILES = readdirSync(DIR).filter((name) => name.endsWith('.vue'))
const source = (file: string) => readFileSync(join(DIR, file), 'utf8')

describe('animation coverage', () => {
  it('has an authored animation for every exercise in the library', () => {
    const authored = new Set(FILES.map((f) => f.replace('.vue', '')))
    const missing = EXERCISES.filter((e) => !authored.has(e.animation.id)).map((e) => e.id)
    expect(missing).toEqual([])
  })

  it('has no orphaned animation files', () => {
    const referenced = new Set(EXERCISES.map((e) => e.animation.id))
    const orphans = FILES.map((f) => f.replace('.vue', '')).filter((id) => !referenced.has(id))
    expect(orphans).toEqual([])
  })

  it('covers every movement in both sessions', () => {
    expect(FILES.length).toBeGreaterThanOrEqual(16)
  })
})

describe.each(FILES)('%s', (file: string) => {
  const text = source(file)

  it('uses the shared 200x200 canvas', () => {
    expect(text).toContain('viewBox="0 0 200 200"')
  })

  it('puts the ground line at the fixed y=185', () => {
    // Fixed across every file so the figure never jumps between exercises.
    expect(text).toMatch(/class="ground"[^/]*y1="185"[^/]*y2="185"/)
  })

  it('is announced as an image with a title', () => {
    expect(text).toContain('role="img"')
    expect(text).toMatch(/<title>[^<]+<\/title>/)
  })

  it('carries no text inside the SVG, which would need translating', () => {
    expect(text).not.toMatch(/<text[\s>]/)
  })

  it('loops on the 3.5s tempo matching the prescribed 2-1 cadence', () => {
    expect(text).toContain('3.5s')
  })

  it('holds at both ends of the movement', () => {
    // 0.25s holds at the start and the stretch: the 7% and 71% stops.
    expect(text).toMatch(/0%,\s*7%/)
    expect(text).toMatch(/64%,\s*71%/)
  })

  it('accepts the paused prop and stops on it', () => {
    expect(text).toContain('paused?: boolean')
    expect(text).toContain('animation-play-state: paused')
  })

  it('draws the body with currentColor and the load with --accent', () => {
    expect(text).toContain('stroke: currentColor')
    if (text.includes('class="load"')) expect(text).toContain('fill: var(--accent)')
  })

  it('falls back to a start pose and an arrow under reduced motion', () => {
    expect(text).toContain('prefers-reduced-motion: reduce')
    expect(text).toContain('class="ghost"')
    expect(text).toContain('class="arrow"')
    // Freezing must be explicit: the global reduced-motion reset would
    // otherwise collapse the animation onto its start frame instead.
    expect(text).toMatch(/animation:\s*none/)
  })

  it('stays within the size budget', () => {
    // Roughly 4KB each. goblet-squat carries the shared convention comment,
    // and the reverse lunge needs a third pose where the path curves.
    const budget = file === 'goblet-squat.vue' || file === 'db-reverse-lunge.vue' ? 5600 : 4400
    expect(text.length).toBeLessThanOrEqual(budget)
  })
})

describe('exercises that share a drawing', () => {
  it('shares only where the movement path is genuinely the same', () => {
    const byAnimation = new Map<string, string[]>()
    for (const exercise of EXERCISES) {
      const list = byAnimation.get(exercise.animation.id) ?? []
      list.push(exercise.id)
      byAnimation.set(exercise.animation.id, list)
    }

    const shared = [...byAnimation.entries()].filter(([, ids]) => ids.length > 1)
    // A seated and a standing press trace the same arc; a hinged row and a
    // bench-supported row do too. Anything else should have its own drawing.
    expect(Object.fromEntries(shared)).toEqual({
      'goblet-squat': ['goblet-squat', 'db-front-squat'],
      'single-arm-row': ['single-arm-row', 'hinged-single-arm-row'],
      'shoulder-press': ['seated-shoulder-press', 'standing-shoulder-press'],
      'db-reverse-lunge': ['db-reverse-lunge', 'split-squat'],
      'db-rdl': ['db-rdl', 'single-leg-rdl'],
    })
  })
})
