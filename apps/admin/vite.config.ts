import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
