import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5175,
  },
  optimizeDeps: {
    include: [
      'dayjs/plugin/weekday',
      'dayjs/plugin/localeData',
      'dayjs/locale/ko',
    ],
  },
})
