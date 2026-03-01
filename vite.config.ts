import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',
  cacheDir: process.env.VITE_CACHE_DIR || 'node_modules/.vite',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 3000, // Tauri 앱은 로컬이라 청크 크기 무관
  },
  server: {
    port: 5173,
  },
  optimizeDeps: {
    include: [
      'dayjs/plugin/weekday',
      'dayjs/plugin/localeData',
      'dayjs/locale/ko',
    ],
  },
})
