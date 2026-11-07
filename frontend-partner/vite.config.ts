import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  // Absolute asset URLs: relative './' breaks full-page loads on nested routes
  // (e.g. /orders/:id resolves ./assets/*.js to /orders/assets/*.js -> SPA
  // fallback serves index.html -> module MIME error -> blank page).
  base: '/',
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    port: 3002
  }
})
