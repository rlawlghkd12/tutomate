import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  app = await electron.launch({
    args: [path.join(__dirname, '../dist-electron/main.js')],
    env: {
      ...process.env,
      NODE_ENV: 'production',
    },
  });
  page = await app.firstWindow();
  // 앱 로딩 대기
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(3000);
});

test.afterAll(async () => {
  await app?.close();
});

test('앱이 정상 실행되고 UI가 렌더링된다', async () => {
  await page.screenshot({ path: 'e2e/screenshots/01-app-launched.png', fullPage: true });

  const title = await page.title();
  console.log('Window title:', title);

  // 페이지에 콘텐츠가 있는지 확인
  const bodyText = await page.textContent('body');
  console.log('Body text length:', bodyText?.length);

  expect(bodyText?.length).toBeGreaterThan(0);
});

test('사이드바/네비게이션이 보인다', async () => {
  await page.screenshot({ path: 'e2e/screenshots/02-navigation.png', fullPage: true });

  // 콘솔 에러 수집
  const errors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.waitForTimeout(1000);
  console.log('Console errors:', errors);
});

test('설정 페이지로 이동', async () => {
  // 설정 메뉴/링크 찾기
  const settingsLink = page.getByText('설정').first();
  if (await settingsLink.isVisible()) {
    await settingsLink.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'e2e/screenshots/03-settings-page.png', fullPage: true });
  } else {
    console.log('설정 링크를 찾을 수 없음');
    await page.screenshot({ path: 'e2e/screenshots/03-no-settings.png', fullPage: true });
  }
});

test('Electron API가 렌더러에서 접근 가능하다', async () => {
  const hasAPI = await page.evaluate(() => {
    return typeof (window as any).electronAPI !== 'undefined';
  });
  console.log('electronAPI available:', hasAPI);
  expect(hasAPI).toBe(true);

  // 앱 버전 확인
  const version = await page.evaluate(() => {
    return (window as any).electronAPI.getAppVersion();
  });
  console.log('App version:', version);

  // 머신 ID 확인
  const machineId = await page.evaluate(() => {
    return (window as any).electronAPI.getMachineId();
  });
  console.log('Machine ID:', machineId?.slice(0, 16) + '...');
});

test('파일 I/O 동작 확인', async () => {
  // 데이터 저장
  await page.evaluate(() => {
    return (window as any).electronAPI.saveData('test_key', JSON.stringify([{ id: '1', name: 'test' }]));
  });

  // 데이터 로드
  const loaded = await page.evaluate(() => {
    return (window as any).electronAPI.loadData('test_key');
  });
  console.log('Loaded data:', loaded);
  expect(loaded).toContain('test');

  // 테스트 데이터 정리
  await page.evaluate(() => {
    return (window as any).electronAPI.saveData('test_key', '[]');
  });
});
