import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import fs from 'node:fs'
import path from 'node:path'
import { appConfig } from './src/app.config'

const electronSharedDir = path.resolve(__dirname, '../../packages/electron-shared');

function copyPreload(): Plugin {
  return {
    name: 'copy-preload',
    writeBundle() {
      const src = path.resolve(electronSharedDir, 'src/preload.cjs');
      const dest = path.resolve('dist-electron/preload.cjs');
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
    },
  };
}

function copyIcon(): Plugin {
  return {
    name: 'copy-icon',
    writeBundle() {
      const src = path.resolve(electronSharedDir, 'build/icon.png');
      const dest = path.resolve('dist-electron/icon.png');
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
      }
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: path.resolve(electronSharedDir, 'src/main.ts'),
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
  define: {
    __APP_CONFIG__: JSON.stringify(appConfig),
  },
  base: './',
  cacheDir: process.env.VITE_CACHE_DIR || 'node_modules/.vite',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 3000,
  },
  server: {
    port: 5174,
  },
  optimizeDeps: {
    include: [
      'dayjs/plugin/weekday',
      'dayjs/plugin/localeData',
      'dayjs/locale/ko',
    ],
  },
})
