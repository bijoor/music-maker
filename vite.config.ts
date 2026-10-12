import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
// Production builds are served from GitHub Pages at /music-maker/.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/music-maker/' : '/',
  plugins: [react()],
}))
