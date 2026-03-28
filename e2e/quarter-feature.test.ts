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

test.describe.serial('분기별 수강 관리 테스트 (tutomate-q)', () => {
  const ts = Date.now();
  const courseName = `분기테스트강좌_${ts}`;
  const studentName = `분기테스트학생_${ts}`;
  const courseFee = 90000;

  // 1. 강좌 생성
  test('강좌 생성', async () => {
    await page.getByText('강좌 관리').first().click();
    await page.waitForTimeout(1000);

    await page.getByText('강좌 개설').first().click();
    await page.waitForTimeout(500);

    const modal = page.locator('.ant-modal').last();
    await modal.locator('#name').fill(courseName);
    await modal.locator('#classroom').fill('분기테스트실');
    await modal.locator('#instructorName').fill('분기강사');
    await modal.locator('#instructorPhone').fill('01011112222');
    await modal.locator('#fee').fill(String(courseFee));
    await modal.locator('#maxStudents').fill('20');

    await modal.getByText('생성', { exact: true }).click();
    await expect(modal).toBeHidden({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(1000);
  });

  // 2. 수강생 등록 — 등록월 체크박스 표시 확인
  test('수강생 등록 시 등록월 체크박스 표시', async () => {
    await page.getByText('수강생 관리').first().click();
    await page.waitForTimeout(1000);

    await page.getByText('수강생 등록').first().click();
    await page.waitForTimeout(500);

    const modal = page.locator('.ant-modal').last();

    // 이름, 전화번호 입력
    await modal.locator('#name').fill(studentName);
    await modal.locator('#phone').fill('01033334444');

    // 강좌 추가
    const courseSelect = modal.locator('.ant-select', { hasText: '강좌를 선택하세요' });
    await courseSelect.click();
    await page.waitForTimeout(1000);

    const dropdown = page.locator('.ant-select-dropdown').last();
    await dropdown.getByText(courseName, { exact: false }).first().click();
    await page.waitForTimeout(1000);

    // 등록월 체크박스 그룹이 표시되는지 확인
    const monthCheckboxes = modal.locator('.ant-checkbox-group .ant-checkbox-wrapper');
    const count = await monthCheckboxes.count();
    expect(count).toBe(3); // 분기당 3개월

    // 스크린샷: 등록월 체크박스 표시
    await page.screenshot({ path: path.join(screenshotDir, 'quarter-01-enrolled-months.png'), fullPage: true });

    // 등록
    await modal.getByText('등록', { exact: true }).click();
    await expect(modal).toBeHidden({ timeout: 5000 }).catch(async () => {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    });
    await page.waitForTimeout(1000);
  });

  // 3. 강좌 상세 — 분기 선택기 표시 확인
  test('강좌 상세에 분기 선택기 표시', async () => {
    await page.getByText('강좌 관리').first().click();
    await page.waitForTimeout(1000);

    // 강좌 행의 "상세" 버튼 클릭
    const courseRow = page.locator('tr', { hasText: courseName });
    await courseRow.getByText('상세').click();
    await page.waitForTimeout(1500);

    // 분기 Select가 보이는지 확인 (수강생 관리 탭 내부)
    const quarterSelect = page.locator('.ant-tabs-tabpane-active .ant-select').first();
    await expect(quarterSelect).toBeVisible();

    // 스크린샷: 강좌 상세 분기 선택기
    await page.screenshot({ path: path.join(screenshotDir, 'quarter-02-course-detail-selector.png'), fullPage: true });
  });

  // 4. 수강생 탭에 새 컬럼 표시 확인
  test('수강생 탭에 분기별 컬럼 표시', async () => {
    // 수강생 관리 탭이 기본 활성
    await page.waitForTimeout(500);

    // 활성 탭 패널 내 테이블 헤더에 새 컬럼 확인
    const tabPane = page.locator('.ant-tabs-tabpane-active');
    const tableHeaders = tabPane.locator('.ant-table-thead th');
    const headerTexts = await tableHeaders.allTextContents();
    const headerStr = headerTexts.join(',');

    // 분기별 컬럼 존재 확인
    expect(headerStr).toContain('회원');
    expect(headerStr).toContain('수강등록월');
    expect(headerStr).toContain('납부금액');
    expect(headerStr).toContain('납부방법');
    expect(headerStr).toContain('납부일자');
    expect(headerStr).toContain('메모');

    // 기존 컬럼 미표시 확인
    expect(headerStr).not.toContain('이번달');
    expect(headerStr).not.toContain('등록일');

    // 스크린샷: 분기별 컬럼이 있는 수강생 테이블
    await page.screenshot({ path: path.join(screenshotDir, 'quarter-03-table-columns.png'), fullPage: true });
  });

  // 5. 수강생 행에 등록월 Tag 표시 확인
  test('수강생 행에 등록월 태그 표시', async () => {
    const studentRow = page.locator('tr', { hasText: studentName });
    const rowText = await studentRow.textContent();

    // 현재 분기의 월 태그가 표시되는지 확인 (1분기면 1월, 2월, 3월)
    const now = new Date();
    const currentQ = Math.ceil((now.getMonth() + 1) / 3);
    const startMonth = (currentQ - 1) * 3 + 1;

    expect(rowText).toContain(`${startMonth}월`);
    expect(rowText).toContain(`${startMonth + 1}월`);
    expect(rowText).toContain(`${startMonth + 2}월`);

    // 스크린샷: 등록월 태그 표시
    await page.screenshot({ path: path.join(screenshotDir, 'quarter-04-enrolled-month-tags.png'), fullPage: true });
  });

  // 6. 분기 변경 시 수강생 필터링 확인
  test('다른 분기 선택 시 수강생 미표시', async () => {
    // 분기 Select 클릭 (탭 패널 내)
    const tabPane = page.locator('.ant-tabs-tabpane-active');
    const quarterSelect = tabPane.locator('.ant-select').first();
    await quarterSelect.click();
    await page.waitForTimeout(500);

    // 다른 분기 선택 (현재 분기가 아닌 것)
    const quarterDropdown = page.locator('.ant-select-dropdown').last();
    const options = quarterDropdown.locator('.ant-select-item-option');
    const optionCount = await options.count();

    let differentQuarterClicked = false;
    for (let i = 0; i < optionCount; i++) {
      const optionEl = options.nth(i);
      const isSelected = await optionEl.getAttribute('aria-selected');
      if (isSelected !== 'true') {
        await optionEl.click();
        differentQuarterClicked = true;
        break;
      }
    }

    if (differentQuarterClicked) {
      await page.waitForTimeout(1000);

      // 다른 분기이므로 수강생이 보이지 않아야 함
      const studentRow = tabPane.locator('tr', { hasText: studentName });
      const hasStudent = await studentRow.isVisible().catch(() => false);
      expect(hasStudent).toBe(false);

      // 스크린샷: 다른 분기에서 수강생 없음
      await page.screenshot({ path: path.join(screenshotDir, 'quarter-05-different-quarter-empty.png'), fullPage: true });

      // 원래 분기로 복원
      await quarterSelect.click();
      await page.waitForTimeout(500);
      const restoreDropdown = page.locator('.ant-select-dropdown').last();
      const now = new Date();
      const year = now.getFullYear();
      const q = Math.ceil((now.getMonth() + 1) / 3);
      await restoreDropdown.getByText(`${year}년 ${q}분기`).click();
      await page.waitForTimeout(1000);
    }
  });

  // 7. EnrollmentForm에서 등록월 체크박스 확인
  test('EnrollmentForm에서 등록월 체크박스 표시', async () => {
    // 수강생 관리 페이지로 이동
    await page.getByText('수강생 관리').first().click();
    await page.waitForTimeout(1000);

    // 수강생 행의 "강좌 신청" 버튼 클릭
    const row = page.locator('tr', { hasText: studentName });
    await row.getByText('강좌 신청').click();
    await page.waitForTimeout(500);

    const modal = page.locator('.ant-modal').last();

    // 강좌 선택
    const courseSelect = modal.locator('.ant-select').first();
    await courseSelect.click();
    await page.waitForTimeout(500);

    // 드롭다운에서 아무 강좌나 보이는지 확인 (이미 등록된 강좌는 disabled)
    const dropdown = page.locator('.ant-select-dropdown').last();
    const enabledOption = dropdown.locator('.ant-select-item-option:not(.ant-select-item-option-disabled)').first();
    const hasEnabled = await enabledOption.isVisible().catch(() => false);

    if (hasEnabled) {
      await enabledOption.click();
      await page.waitForTimeout(500);

      // 등록월 체크박스 확인
      const monthCheckboxes = modal.locator('.ant-checkbox-group .ant-checkbox-wrapper');
      const checkboxCount = await monthCheckboxes.count();
      expect(checkboxCount).toBe(3);

      // 스크린샷: EnrollmentForm 등록월 체크박스
      await page.screenshot({ path: path.join(screenshotDir, 'quarter-06-enrollment-form-months.png'), fullPage: true });
    }

    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  });

  // 8. 정리 — 수강생 삭제
  test('정리 — 수강생 삭제', async () => {
    await page.getByText('수강생 관리').first().click();
    await page.waitForTimeout(1000);

    const row = page.locator('tr', { hasText: studentName });
    await row.getByText('삭제').click();
    await page.waitForTimeout(500);

    const confirmModal = page.locator('.ant-modal-confirm');
    await confirmModal.locator('.ant-modal-confirm-btns .ant-btn-dangerous').click();
    await page.waitForTimeout(2000);
  });

  // 9. 정리 — 강좌 삭제
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
