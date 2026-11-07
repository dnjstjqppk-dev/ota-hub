import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  // Absolute asset URLs: relative './' breaks full-page loads on nested routes
  // (same class as the partner /orders/:id blank page). Hub subpath mounts
  // (/admin/*) keep working via the /assets fallback in worker/index.ts.
  base: '/',
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    port: 3001,
    proxy: {
      '/api': {
        target: process.env.VITE_API_BACKEND_TARGET || 'http://localhost:8080',
        changeOrigin: true
      }
    }
  }
})
