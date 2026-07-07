import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'packages/core/src/**/__tests__/**/*.test.ts',
      'packages/electron-shared/src/**/__tests__/**/*.test.ts',
      // Edge Function 순수 로직(logic.ts)만 테스트 — index.ts는 Deno 전용이라 제외.
      'supabase/functions/**/__tests__/**/*.test.ts',
    ],
    exclude: ['e2e/**', '**/node_modules/**', '.claude/**'],
    globals: true,
    environment: 'jsdom',
    setupFiles: ['packages/core/src/__tests__/setup.ts'],
  },
});
