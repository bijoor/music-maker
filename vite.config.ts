/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const YEAR = 60 * 60 * 24 * 365

// https://vite.dev/config/
// Production builds are served from GitHub Pages at /music-maker/ and install as an app (PWA).
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/music-maker/' : '/',
  plugins: [
    react(),
    VitePWA({
      // Ask before switching to a new version, so an update never reloads the app mid-performance.
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Music Maker',
        short_name: 'Music Maker',
        description: 'A loop-based music maker that writes Strudel code as you play.',
        display: 'standalone',
        orientation: 'landscape',
        background_color: '#121513',
        theme_color: '#121513',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,json,mp3}'],
        // Control the page from the first visit, so sounds are cached right away (updates still wait for the prompt).
        clientsClaim: true,
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        // Samples and soundfonts come from GitHub and jsDelivr; keep every one used so the app works offline afterwards.
        runtimeCaching: [
          {
            urlPattern: ({ url }) => /(^|\.)githubusercontent\.com$|\.github\.io$|^cdn\.jsdelivr\.net$/.test(url.hostname),
            handler: 'CacheFirst',
            options: { cacheName: 'sounds', expiration: { maxEntries: 4000, maxAgeSeconds: YEAR }, cacheableResponse: { statuses: [0, 200] } },
          },
        ],
      },
    }),
  ],
  test: {
    environment: 'node',
    // Let Vite resolve Strudel's dependencies by their ES module entry points (Node would pick CommonJS ones).
    server: { deps: { inline: [/@strudel\//, /@kabelsalat\//] } },
  },
}))
