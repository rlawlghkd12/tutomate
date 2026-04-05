import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/core/src/**/__tests__/**/*.test.ts'],
    exclude: ['e2e/**', '**/node_modules/**', '.claude/**'],
    globals: true,
    environment: 'jsdom',
    setupFiles: ['packages/core/src/__tests__/setup.ts'],
  },
});
