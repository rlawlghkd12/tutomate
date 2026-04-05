import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/__tests__/**/*.test.ts'],
    setupFiles: ['src/__tests__/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/utils/**/*.ts', 'src/stores/**/*.ts', 'src/hooks/**/*.ts', 'src/lib/**/*.ts'],
      exclude: [
        'src/**/__tests__/**',
        'src/types/**',
        'src/config/**',
        'src/index.ts',
        // 인프라 코드 — 커버리지 대상 제외
        'src/hooks/useBackup.ts',
        'src/utils/backupHelper.ts',
        'src/utils/dayjs.ts',
        'src/utils/tauri.ts',
        'src/lib/oauth/index.ts',
      ],
      thresholds: {
        statements: 95,
        branches: 95,
        lines: 95,
      },
    },
  },
});
