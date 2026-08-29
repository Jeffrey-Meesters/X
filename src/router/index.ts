import { createRouter, createWebHistory } from 'vue-router'
import { useSettingsStore } from '@/stores/settings'

/**
 * Views are lazy-loaded except Home, so the first paint on a cold start stays
 * small. The service worker precaches every chunk, so offline is unaffected.
 */
const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'home', component: () => import('@/views/HomeView.vue') },
    { path: '/session/:sessionId', name: 'player', component: () => import('@/views/PlayerView.vue') },
    { path: '/summary/:logId', name: 'summary', component: () => import('@/views/SummaryView.vue') },
    { path: '/history', name: 'history', component: () => import('@/views/HistoryView.vue') },
    { path: '/settings', name: 'settings', component: () => import('@/views/SettingsView.vue') },
    { path: '/onboarding', name: 'onboarding', component: () => import('@/views/OnboardingView.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

/**
 * First run goes to onboarding, and nothing else is reachable until the safety
 * acknowledgement has been tapped (spec section 10). Settings is deliberately
 * not exempt: there is nothing there to configure before the app is set up.
 */
router.beforeEach((to) => {
  const settingsStore = useSettingsStore()
  const needsOnboarding = settingsStore.settings.safetyAcknowledgedAt === null

  if (needsOnboarding && to.name !== 'onboarding') return { name: 'onboarding' }
  if (!needsOnboarding && to.name === 'onboarding') return { name: 'home' }
  return true
})

export default router
