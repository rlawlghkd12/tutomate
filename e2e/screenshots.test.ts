/**
 * 화면별 스크린샷 캡처
 * 실행: npx playwright test e2e/screenshots.test.ts
 * 결과: e2e/screenshots/ 디렉토리에 PNG 저장
 */
import { test, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const screenshotDir = path.join(__dirname, 'screenshots');

let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  fs.mkdirSync(screenshotDir, { recursive: true });

  app = await electron.launch({
    args: [path.join(__dirname, '../dist-electron/main.js')],
    env: { ...process.env, NODE_ENV: 'production' },
  });
  page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(5000);

  // Welcome 모달 dismiss
  const trialBtn = page.getByText('체험판으로 시작');
  if (await trialBtn.isVisible().catch(() => false)) {
    await trialBtn.click();
    await page.waitForTimeout(1000);
  }
});

test.afterAll(async () => {
  await app?.close();
});

async function capture(name: string, waitMs = 1500) {
  await page.waitForTimeout(waitMs);
  await page.screenshot({ path: path.join(screenshotDir, `${name}.png`), fullPage: true });
}

test('01-대시보드', async () => {
  await page.getByText('대시보드').first().click();
  await capture('01-dashboard');
});

test('02-강좌-목록', async () => {
  await page.getByText('강좌 관리').first().click();
  await capture('02-course-list');
});

test('03-강좌-개설-모달', async () => {
  await page.getByText('강좌 개설').first().click();
  await capture('03-course-create-modal', 500);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
});

test('04-수강생-목록', async () => {
  await page.getByText('수강생 관리').first().click();
  await capture('04-student-list');
});

test('05-수강생-등록-모달', async () => {
  await page.getByText('수강생 등록').first().click();
  await capture('05-student-create-modal', 500);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
});

test('06-캘린더', async () => {
  await page.getByText('캘린더').first().click();
  await capture('06-calendar');
});

test('07-수익-관리', async () => {
  await page.getByText('수익 관리').first().click();
  await capture('07-revenue');
});

test('08-설정-일반', async () => {
  await page.getByText('설정').first().click();
  await capture('08-settings-general');
});

test('09-설정-라이선스', async () => {
  const tab = page.getByText('라이선스', { exact: false }).first();
  if (await tab.isVisible().catch(() => false)) {
    await tab.click();
    await capture('09-settings-license');
  }
});

test('10-글로벌-검색', async () => {
  const isMac = process.platform === 'darwin';
  await page.keyboard.press(isMac ? 'Meta+k' : 'Control+k');
  await capture('10-global-search', 500);
  await page.keyboard.press('Escape');
});
