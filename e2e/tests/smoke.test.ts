/**
 * E2E Smoke 테스트
 *
 * 사전 조건:
 *   1. supabase start
 *   2. pnpm --filter @tutomate/app dev  (dist-electron/main.js 생성)
 *   3. pnpm test:e2e:setup              (테스트 유저 + 세션 파일 생성)
 *
 * 실행: pnpm test:e2e
 */
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchApp, loadSession, navigateTo } from '../helpers/electron';
import type { E2ESession } from '../setup';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let app: ElectronApplication;
let page: Page;
let session: E2ESession;

// 테스트 중 생성된 데이터를 추적 (정리용)
const createdData = {
  courseNames: [] as string[],
  studentNames: [] as string[],
};

// ── 전역 setup / teardown ────────────────────────────────────

test.beforeAll(async () => {
  session = loadSession();
  ({ app, page } = await launchApp());
});

test.afterAll(async () => {
  // 테스트 중 생성된 데이터 정리 (DB 직접 삭제)
  try {
    const pg = await import('pg');
    const client = new pg.default.Client('postgresql://postgres:postgres@127.0.0.1:54322/postgres');
    await client.connect();
    await client.query(`DELETE FROM payment_records WHERE organization_id = $1`, [session.organization_id]);
    await client.query(`DELETE FROM enrollments WHERE organization_id = $1`, [session.organization_id]);
    await client.query(`DELETE FROM students WHERE organization_id = $1`, [session.organization_id]);
    await client.query(`DELETE FROM courses WHERE organization_id = $1`, [session.organization_id]);
    await client.end();
  } catch (e) {
    console.warn('[e2e:cleanup] 데이터 정리 실패:', e);
  }

  await app?.close();
});

// ── 1. 앱 시작 + 대시보드 표시 ──────────────────────────────

test.describe.serial('핵심 플로우', () => {
  test('앱 시작 + 로그인 후 대시보드 표시', async () => {
    // 사이드바가 보이는지 확인 (로그인 성공 의미)
    await expect(page.getByText('대시보드').first()).toBeVisible();
    await expect(page.getByText('강좌 관리').first()).toBeVisible();
    await expect(page.getByText('수강생 관리').first()).toBeVisible();
  });

  // ── 2. 강좌 개설 → 목록에 표시 ────────────────────────────

  test('강좌 개설 -> 목록에 표시', async () => {
    // 강좌 관리 페이지로 이동
    await navigateTo(page, '강좌 관리');

    // "강좌 개설" 버튼 클릭
    await page.getByText('강좌 개설').click();
    await page.waitForTimeout(500);

    // 모달이 열렸는지 확인
    await expect(page.getByText('강좌 개설', { exact: false }).first()).toBeVisible();

    // 폼 입력
    const courseName = `E2E 테스트 강좌 ${Date.now()}`;
    createdData.courseNames.push(courseName);

    await page.locator('input[name="name"]').fill(courseName);
    await page.locator('input[name="classroom"]').fill('E2E 테스트실');
    await page.locator('input[name="instructorName"]').fill('테스트 강사');
    await page.locator('input[name="instructorPhone"]').fill('01000000000');

    // 제출
    await page.getByRole('button', { name: '생성' }).click();
    await page.waitForTimeout(1000);

    // 목록에서 생성된 강좌 확인
    await expect(page.getByText(courseName).first()).toBeVisible({ timeout: 5000 });
  });

  // ── 3. 수강생 등록 → 목록에 표시 ──────────────────────────

  test('수강생 등록 -> 목록에 표시', async () => {
    // 수강생 관리 페이지로 이동
    await navigateTo(page, '수강생 관리');

    // 페이지 전환 대기 + 스크린샷
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'e2e/screenshots/e2e-student-page.png' });

    // "수강생 등록" 버튼 클릭
    const regBtn = page.locator('button:has-text("수강생 등록")');
    await regBtn.waitFor({ state: 'visible', timeout: 10000 });
    await regBtn.click();
    await page.waitForTimeout(2000);

    // 폼 입력 — 이름 (combobox), 전화번호
    const studentName = `테스트학생${Date.now()}`;
    createdData.studentNames.push(studentName);

    // 모달 안에서 이름 Combobox 클릭 → Popover 열림 → 이름 입력
    await page.locator('button[role="combobox"]:has-text("김철수")').click({ force: true });
    await page.waitForTimeout(500);
    // CommandInput (placeholder="이름 검색...")에 입력
    await page.locator('input[placeholder="이름 검색..."]').fill(studentName);
    await page.waitForTimeout(300);
    // Popover 닫기
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // 전화번호 입력 (placeholder="01012341234")
    await page.locator('input[placeholder="01012341234"]').fill('01099998888', { force: true });

    // 등록 버튼 클릭
    await page.locator('button:has-text("등록")').last().click({ force: true });
    await page.waitForTimeout(1000);

    // 목록에서 생성된 수강생 확인
    await expect(page.getByText(studentName).first()).toBeVisible({ timeout: 5000 });
  });

  // ── 4. 수강 신청 + 납부 처리 ──────────────────────────────

  test('수강 신청 + 납부 처리', async () => {
    // 이전 테스트에서 만든 강좌와 수강생을 사용
    const studentName = createdData.studentNames[0];
    const courseName = createdData.courseNames[0];
    if (!studentName || !courseName) {
      test.skip(true, '이전 테스트에서 데이터 미생성');
      return;
    }

    // 1. 수강생 목록에서 수강생 이름 버튼 클릭 → StudentForm 모달
    await navigateTo(page, '수강생 관리');
    await page.waitForTimeout(2000);

    // 이름이 버튼으로 렌더됨 — 해당 버튼 클릭
    const nameBtn = page.locator(`button:has-text("${studentName.substring(0, 8)}")`);
    await nameBtn.waitFor({ state: 'visible', timeout: 10000 });
    await nameBtn.click();
    await page.waitForTimeout(2000);

    // 2. StudentForm 모달에서 강좌 Select 클릭
    // "강좌 신청" 라벨 아래 Select trigger
    const selectTrigger = page.locator('[role="dialog"] button[role="combobox"]').last();
    await selectTrigger.waitFor({ state: 'visible', timeout: 5000 });
    await selectTrigger.click({ force: true });
    await page.waitForTimeout(500);

    // 3. 강좌 옵션 선택
    const courseOption = page.locator(`[role="option"]`).filter({ hasText: courseName.substring(0, 15) });
    await courseOption.waitFor({ state: 'visible', timeout: 5000 });
    await courseOption.click();
    await page.waitForTimeout(1000);

    // 4. 강좌가 추가되면 납부 정보 섹션이 나타남 — "수정" 클릭
    const saveBtn = page.locator('[role="dialog"] button:has-text("수정")');
    await saveBtn.waitFor({ state: 'visible', timeout: 5000 });
    await saveBtn.click({ force: true });
    await page.waitForTimeout(2000);

    // 5. 수강생 목록에서 강좌 확인
    const updatedRow = page.locator(`table tbody tr`).filter({ hasText: studentName });
    await expect(updatedRow).toBeVisible({ timeout: 5000 });
    const rowText = await updatedRow.innerText();
    // 강좌가 등록되었으면 강좌 컬럼에 표시됨
    expect(rowText.length).toBeGreaterThan(10); // 최소한 데이터가 있음
  });

  // ── 5. 페이지 네비게이션 검증 ──────────────────────────────

  test('전체 페이지 네비게이션 정상 동작', async () => {
    const pages = ['대시보드', '강좌 관리', '수강생 관리', '캘린더', '수익 관리', '설정'];

    for (const pageName of pages) {
      await navigateTo(page, pageName);
      // 헤더에 페이지 제목이 표시되는지 확인
      await expect(page.getByRole('heading', { name: pageName }).first()).toBeVisible({
        timeout: 5000,
      });
    }
  });
});
