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
      exclude: ['src/**/__tests__/**', 'src/types/**', 'src/config/**', 'src/index.ts'],
      thresholds: {
        branches: 95,
      },
    },
  },
});
