import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  app = await electron.launch({
    args: [path.join(__dirname, '../apps/tutomate-q/dist-electron/main.js')],
    env: {
      ...process.env,
      NODE_ENV: 'production',
    },
  });
  page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(5000);

  // Welcome 모달 닫기
  const trialButton = page.getByText('체험판으로 시작', { exact: false });
  if (await trialButton.isVisible().catch(() => false)) {
    await trialButton.click();
    await page.waitForTimeout(500);
  }
});

test.afterAll(async () => {
  await app?.close();
});

const screenshotDir = path.join(__dirname, 'screenshots');

test.describe.serial('회원 기능 테스트 (tutomate-q)', () => {
  const ts = Date.now();
  const courseName = `회원테스트강좌_${ts}`;
  const memberName = `회원테스트_${ts}`;
  const courseFee = 100000;

  // 1. 강좌 생성
  test('강좌 생성', async () => {
    await page.getByText('강좌 관리').first().click();
    await page.waitForTimeout(1000);

    await page.getByText('강좌 개설').first().click();
    await page.waitForTimeout(500);

    const modal = page.locator('.ant-modal').last();
    await modal.locator('#name').fill(courseName);
    await modal.locator('#classroom').fill('테스트실');
    await modal.locator('#instructorName').fill('테스트강사');
    await modal.locator('#instructorPhone').fill('01099990000');
    await modal.locator('#fee').fill(String(courseFee));
    await modal.locator('#maxStudents').fill('20');

    await modal.getByText('생성', { exact: true }).click();
    await expect(modal).toBeHidden({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(1000);
  });

  // 2. 수강생 등록 — 회원 토글 표시 확인 + 회원 체크
  test('수강생 등록 모달에 회원 토글이 표시됨', async () => {
    await page.getByText('수강생 관리').first().click();
    await page.waitForTimeout(1000);

    await page.getByText('수강생 등록').first().click();
    await page.waitForTimeout(500);

    const modal = page.locator('.ant-modal').last();

    // 회원/비회원 Switch가 보이는지 확인
    const switchEl = modal.locator('.ant-switch');
    await expect(switchEl).toBeVisible();

    // 스크린샷: 회원 토글 표시 (비회원 상태)
    await page.screenshot({ path: path.join(screenshotDir, 'member-01-toggle-visible.png'), fullPage: true });

    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  });

  // 3. 회원으로 수강생 등록 + 강좌 추가 → 자동 면제 확인
  test('회원 체크 후 강좌 추가 시 자동 면제', async () => {
    await page.getByText('수강생 등록').first().click();
    await page.waitForTimeout(500);

    const modal = page.locator('.ant-modal').last();

    // 이름, 전화번호 입력
    await modal.locator('#name').fill(memberName);
    await modal.locator('#phone').fill('01088887777');

    // 회원 토글 ON
    const switchEl = modal.locator('.ant-switch');
    await switchEl.click();
    await page.waitForTimeout(300);

    // 스크린샷: 회원 토글 ON 상태
    await page.screenshot({ path: path.join(screenshotDir, 'member-02-toggle-on.png'), fullPage: true });

    // 강좌 추가 — "강좌를 선택하세요" placeholder가 있는 Select 클릭
    const courseSelect = modal.locator('.ant-select', { hasText: '강좌를 선택하세요' });
    await courseSelect.click();
    await page.waitForTimeout(1000);

    // 드롭다운에서 강좌 선택
    const dropdown = page.locator('.ant-select-dropdown').last();
    await dropdown.getByText(courseName, { exact: false }).first().click();
    await page.waitForTimeout(1000);

    // 면제 태그가 표시되는지 확인
    const modalText = await modal.textContent();
    expect(modalText).toContain('면제');

    // 스크린샷: 강좌 추가 후 자동 면제 상태
    await page.screenshot({ path: path.join(screenshotDir, 'member-03-auto-exempt.png'), fullPage: true });

    // 등록
    await modal.getByText('등록', { exact: true }).click();
    await expect(modal).toBeHidden({ timeout: 5000 }).catch(async () => {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    });
    await page.waitForTimeout(1000);
  });

  // 4. 수강생 목록에서 회원 태그 확인
  test('수강생 목록에 회원 태그 표시', async () => {
    await page.waitForTimeout(500);

    const row = page.locator('tr', { hasText: memberName });
    const rowText = await row.textContent();
    expect(rowText).toContain('회원');

    // 스크린샷: 수강생 목록의 회원 태그
    await page.screenshot({ path: path.join(screenshotDir, 'member-04-list-tag.png'), fullPage: true });
  });

  // 5. 수강생 수정 모달에서 isMember 로드 확인
  test('수정 모달에서 회원 상태 유지됨', async () => {
    const row = page.locator('tr', { hasText: memberName });
    await row.getByText('수정').click();
    await page.waitForTimeout(500);

    const modal = page.locator('.ant-modal').last();
    const switchEl = modal.locator('.ant-switch');

    // Switch가 켜져 있는지 확인 (ant-switch-checked class)
    await expect(switchEl).toHaveClass(/ant-switch-checked/);

    // 스크린샷: 수정 모달에서 회원 상태 유지
    await page.screenshot({ path: path.join(screenshotDir, 'member-05-edit-loaded.png'), fullPage: true });

    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  });

  // 6. 비회원 수강생 등록 — 면제 아님 확인
  test('비회원 수강생 강좌 추가 시 면제 아님', async () => {
    const nonMemberName = `비회원테스트_${ts}`;

    // 모달이 열려있으면 닫기
    const anyModal = page.locator('.ant-modal-wrap');
    if (await anyModal.isVisible().catch(() => false)) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }

    await page.getByText('수강생 등록').first().click();
    await page.waitForTimeout(1000);

    const modal = page.locator('.ant-modal').last();
    await modal.locator('#name').fill(nonMemberName);
    await modal.locator('#phone').fill('01066665555');

    // 회원 토글 건드리지 않음 (기본 비회원)

    // 강좌 추가
    const courseSelect = modal.locator('.ant-select', { hasText: '강좌를 선택하세요' });
    await courseSelect.click();
    await page.waitForTimeout(1000);

    const dropdown = page.locator('.ant-select-dropdown').last();
    await dropdown.getByText(courseName, { exact: false }).first().click();
    await page.waitForTimeout(1000);

    // 면제가 아닌 정상 금액 표시 확인
    const modalText = await modal.textContent();
    expect(modalText).toContain(`₩${courseFee.toLocaleString()}`);

    // 스크린샷: 비회원은 면제 아님
    await page.screenshot({ path: path.join(screenshotDir, 'member-06-non-member-no-exempt.png'), fullPage: true });

    // 등록
    await modal.getByText('등록', { exact: true }).click();
    await expect(modal).toBeHidden({ timeout: 5000 }).catch(async () => {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    });
    await page.waitForTimeout(1000);

    // 비회원 수강생 삭제 (정리)
    const row = page.locator('tr', { hasText: nonMemberName });
    await row.getByText('삭제').click();
    await page.waitForTimeout(500);
    const confirmModal = page.locator('.ant-modal-confirm');
    await confirmModal.locator('.ant-modal-confirm-btns .ant-btn-dangerous').click();
    await page.waitForTimeout(2000);
  });

  // 7. 정리 — 회원 수강생 삭제
  test('정리 — 회원 수강생 삭제', async () => {
    const row = page.locator('tr', { hasText: memberName });
    await row.getByText('삭제').click();
    await page.waitForTimeout(500);

    const confirmModal = page.locator('.ant-modal-confirm');
    await confirmModal.locator('.ant-modal-confirm-btns .ant-btn-dangerous').click();
    await page.waitForTimeout(2000);
  });

  // 8. 정리 — 강좌 삭제
  test('정리 — 강좌 삭제', async () => {
    await page.getByText('강좌 관리').first().click();
    await page.waitForTimeout(1000);

    const row = page.locator('tr', { hasText: courseName });
    await row.getByText('삭제').click();
    await page.waitForTimeout(500);

    const confirmModal = page.locator('.ant-modal-confirm');
    await confirmModal.locator('.ant-modal-confirm-btns .ant-btn-dangerous').click();
    await page.waitForTimeout(2000);
  });
});
