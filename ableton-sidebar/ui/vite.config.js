import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Dev: vite on 5173 proxies API calls to the sidecar on 8765.
// Prod: `vite build` outputs to ../sidecar/public, served by the sidecar itself.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: '../sidecar/public',
    emptyOutDir: true,
    // Live 11's Max embeds an older Chromium in jweb — modern syntax
    // (?. / ??) hard-crashes the bundle there. Lower everything.
    target: 'es2015',
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:8765',
      '/files': 'http://127.0.0.1:8765',
      '/events': 'http://127.0.0.1:8765',
    },
  },
})
