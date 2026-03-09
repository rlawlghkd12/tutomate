import { test, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let app: ElectronApplication;
let page: Page;

test('앱 콘솔 로그 디버깅', async () => {
  app = await electron.launch({
    args: [path.join(__dirname, '../dist-electron/main.js')],
    env: {
      ...process.env,
      NODE_ENV: 'production',
    },
  });

  page = await app.firstWindow();

  // 모든 콘솔 메시지 캡처
  const logs: string[] = [];
  page.on('console', msg => {
    logs.push(`[${msg.type()}] ${msg.text()}`);
  });

  // 페이지 에러도 캡처
  page.on('pageerror', err => {
    logs.push(`[PAGE ERROR] ${err.message}`);
  });

  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(10000); // 10초 대기

  // 스크린샷
  await page.screenshot({ path: 'e2e/screenshots/debug-console.png', fullPage: true });

  // 페이지 내 Supabase 연결 상태 + authStore 상태 확인
  const state = await page.evaluate(async () => {
    const w = window as any;

    // electronAPI 테스트
    let machineId = 'N/A';
    try {
      machineId = await w.electronAPI?.getMachineId();
    } catch (e: any) { machineId = `error: ${e.message}`; }

    return {
      hasElectronAPI: !!w.electronAPI,
      bodyText: document.body?.innerText?.slice(0, 500),
      machineId: machineId?.slice(0, 16),
    };
  });

  console.log('\n=== Debug Info ===');
  console.log('electronAPI:', state.hasElectronAPI);
  console.log('Machine ID:', state.machineId);
  console.log('Body text:', JSON.stringify(state.bodyText));
  console.log('\n=== Console Logs ===');
  logs.forEach(l => console.log(l));

  await app.close();
});
