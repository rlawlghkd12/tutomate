import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
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

export default defineConfig(({ mode }) => {
  // 메인 프로세스(main.ts)는 패키징 후 런타임에 process.env가 비어 있다(사용자 PC 환경엔
  // 빌드용 env가 없음). 그래서 AI 백엔드 설정을 빌드 시점에 번들로 구워 넣는다.
  // .env* 파일 + 셸 env 양쪽에서 읽어 정의한다(없으면 빈 문자열 → getAiBackend는 'llama' 폴백).
  const env = loadEnv(mode, __dirname, '');
  const bake = (k: string) => JSON.stringify(env[k] ?? process.env[k] ?? '');
  const aiEnvDefine = {
    'process.env.TUTOMATE_AI_BACKEND': bake('TUTOMATE_AI_BACKEND'),
    'process.env.TUTOMATE_AI_PROXY_URL': bake('TUTOMATE_AI_PROXY_URL'),
    'process.env.SUPABASE_URL': bake('SUPABASE_URL'),
    'process.env.VITE_SUPABASE_URL': bake('VITE_SUPABASE_URL'),
    'process.env.TUTOMATE_AI_MODEL': bake('TUTOMATE_AI_MODEL'),
  };
  return {
    plugins: [
      react(),
      tailwindcss(),
      electron([
        {
          entry: path.resolve(electronSharedDir, 'src/main.ts'),
          vite: {
            build: {
              outDir: 'dist-electron',
              rollupOptions: {
                // electron만 externalize. node-llama-cpp 의존성 제거됨.
                external: ['electron'],
              },
            },
            define: {
              __APP_SCHEME__: JSON.stringify(appConfig.scheme || 'tutomate'),
              ...aiEnvDefine,
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
      port: 5173,
    },
    optimizeDeps: {
      include: [
        'dayjs/plugin/weekday',
        'dayjs/plugin/localeData',
        'dayjs/locale/ko',
      ],
    },
  }
})
