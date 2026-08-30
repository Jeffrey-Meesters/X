import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    VitePWA({
      /**
       * `prompt`, not `autoUpdate`.
       *
       * These are mutually exclusive in this plugin, and the difference is not
       * cosmetic: on `autoUpdate` the client calls `window.location.reload()`
       * the moment a new worker activates. That is a page reload landing on
       * someone mid-set with the phone on the floor - the one moment this app
       * must not blink. On `prompt` the new worker waits, and the user taps to
       * take it.
       */
      registerType: 'prompt',
      injectRegister: null,
      includeAssets: ['icons/favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: '15-Minute Full Body',
        short_name: 'Full Body',
        description:
          'A guided 15-minute full-body dumbbell workout with a hands-free timer, audio cues and set logging. Works offline.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        // The player is a fixed one-screen surface designed for a phone stood
        // or laid in portrait; letting it rotate into landscape mid-set
        // reflows the countdown for no benefit.
        orientation: 'portrait',
        background_color: '#0b0d12',
        theme_color: '#0b0d12',
        categories: ['health', 'fitness', 'sports'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Everything the app is made of, precached on first load. There are no
        // runtime-fetched assets by design: tones are synthesised, movement
        // demos are inline SVG, and there is no backend - so "works offline"
        // needs no runtime caching strategy, just a complete precache.
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        // Client-side routing: /history requested cold has no file behind it.
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
})
