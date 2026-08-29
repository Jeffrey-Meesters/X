import { defineAsyncComponent, type Component } from 'vue'
import GenericFigure from './GenericFigure.vue'

/**
 * Resolves an exercise's animation id to its hand-authored component.
 *
 * Lazily loaded via a glob so the sixteen SVGs stay out of the initial bundle;
 * the service worker precaches every chunk, so offline is unaffected. Two
 * exercises may share an animation where the movement path is identical - a
 * seated and a standing shoulder press trace the same arc.
 */
const modules = import.meta.glob<{ default: Component }>('./moves/*.vue')

const cache = new Map<string, Component>()

export function resolveAnimation(animationId: string): Component {
  const cached = cache.get(animationId)
  if (cached) return cached

  const loader = modules[`./moves/${animationId}.vue`]
  // Falls back to the generic figure rather than rendering nothing, so a new
  // exercise without its own drawing still shows something sensible.
  const component = loader
    ? defineAsyncComponent({ loader, delay: 0 })
    : GenericFigure

  cache.set(animationId, component)
  return component
}

/** Animation ids that have a hand-authored component. Used by tests. */
export function authoredAnimationIds(): string[] {
  return Object.keys(modules)
    .map((path) => path.replace('./moves/', '').replace('.vue', ''))
    .sort()
}
