import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { iconify } from './vite/iconify'
import { notices } from './vite/notices'

const api = process.env.API_URL ?? 'http://127.0.0.1:8000'

export default defineConfig({
  plugins: [react(), tailwindcss(), iconify(), notices()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // the background remover's worker isn't seen by the startup scan; without this the
  // dev server re-bundles and reloads the page the first time it runs
  optimizeDeps: { include: ['onnxruntime-web/wasm'] },
  server: {
    port: 5173,
    // test output lands in this folder; writing it shouldn't reload open pages
    watch: { ignored: ['**/test-results/**', '**/playwright-report/**'] },
    proxy: {
      '/api': api,
      '/media': api,
      '/mcp': api,
      // keep the browser's host so the admin site's redirects and asset links stay on this port
      '/admin': { target: api },
      '/ws': { target: api.replace(/^http/, 'ws'), ws: true },
    },
  },
  worker: { format: 'es' },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
})
