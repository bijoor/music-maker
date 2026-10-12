/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
// Production builds are served from GitHub Pages at /music-maker/.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/music-maker/' : '/',
  plugins: [react()],
  test: {
    environment: 'node',
    // Let Vite resolve Strudel's dependencies by their ES module entry points (Node would pick CommonJS ones).
    server: { deps: { inline: [/@strudel\//, /@kabelsalat\//] } },
  },
}))
