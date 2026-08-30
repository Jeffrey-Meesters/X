import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './styles/main.css'
import { applyStoredTheme } from './composables/useTheme'

// Before mount, and before Pinia: the document ships with `class="dark"`, so a
// light-theme user would otherwise see a dark frame painted and then swapped.
applyStoredTheme()

createApp(App).use(createPinia()).use(router).mount('#app')
