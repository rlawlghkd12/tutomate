import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import fs from 'node:fs'
import path from 'node:path'

// Preload를 CJS로 유지하기 위해 단순 복사 플러그인 사용
function copyPreload(): Plugin {
  return {
    name: 'copy-preload',
    writeBundle() {
      const src = path.resolve('electron/preload.cjs');
      const dest = path.resolve('dist-electron/preload.cjs');
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
    },
  };
}

// 앱 아이콘을 dist-electron에 복사 (BrowserWindow icon용)
function copyIcon(): Plugin {
  return {
    name: 'copy-icon',
    writeBundle() {
      const src = path.resolve('build/icon.png');
      const dest = path.resolve('dist-electron/icon.png');
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
      }
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: 'electron/main.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['electron'],
            },
          },
          plugins: [copyPreload(), copyIcon()],
        },
      },
    ]),
    renderer(),
  ],
  base: './',
  cacheDir: process.env.VITE_CACHE_DIR || 'node_modules/.vite',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 3000,
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
