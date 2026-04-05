import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  retries: 0,
  use: {
    trace: 'on-first-retry',
  },
  // 테스트를 순차적으로 실행 (단일 Electron 앱 인스턴스 공유)
  workers: 1,
});
