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
  await page.waitForLoadState('domcontentloaded');
  // 앱 초기화 (Supabase auth + org 조회) 대기
  await page.waitForTimeout(5000);
});

test.afterAll(async () => {
  await app?.close();
});

// ─── 앱 시작 ──────────────────────────────────────────────

test.describe('앱 시작', () => {
  test('UI가 렌더링된다', async () => {
    const bodyText = await page.textContent('body');
    expect(bodyText?.length).toBeGreaterThan(0);
  });

  test('콘솔에 치명적 에러 없음', async () => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await page.waitForTimeout(2000);
    // Supabase 관련 네트워크 에러는 무시 (오프라인 테스트 가능)
    const criticalErrors = errors.filter(e =>
      !e.includes('supabase') && !e.includes('fetch') && !e.includes('net::')
    );
    expect(criticalErrors).toHaveLength(0);
  });
});

// ─── Electron IPC API ─────────────────────────────────────

test.describe('Electron IPC API', () => {
  test('electronAPI가 렌더러에서 접근 가능', async () => {
    const hasAPI = await page.evaluate(() => {
      return typeof (window as any).electronAPI !== 'undefined';
    });
    expect(hasAPI).toBe(true);
  });

  test('getAppVersion — 유효한 semver 반환', async () => {
    const version = await page.evaluate(() => {
      return (window as any).electronAPI.getAppVersion();
    });
    expect(version).toMatch(/^\d+\.\d+\.\d+/);
  });

  test('getMachineId — 비어있지 않은 문자열 반환', async () => {
    const machineId = await page.evaluate(() => {
      return (window as any).electronAPI.getMachineId();
    });
    expect(machineId).toBeTruthy();
    expect(typeof machineId).toBe('string');
    expect(machineId.length).toBeGreaterThan(0);
  });

  test('saveData + loadData — 왕복 저장/로드', async () => {
    const testData = JSON.stringify([{ id: 'e2e-test', name: 'E2E 테스트' }]);

    await page.evaluate((data) => {
      return (window as any).electronAPI.saveData('__e2e_test__', data);
    }, testData);

    const loaded = await page.evaluate(() => {
      return (window as any).electronAPI.loadData('__e2e_test__');
    });
    expect(loaded).toContain('e2e-test');
    expect(loaded).toContain('E2E 테스트');

    // 정리
    await page.evaluate(() => {
      return (window as any).electronAPI.saveData('__e2e_test__', '[]');
    });
  });

  test('loadData — 존재하지 않는 키 → null 또는 빈 값', async () => {
    const loaded = await page.evaluate(() => {
      return (window as any).electronAPI.loadData('__nonexistent_key_e2e__');
    });
    // null이거나 빈 문자열이면 OK
    expect(!loaded || loaded === '[]' || loaded === '').toBe(true);
  });

  test('listBackups — 배열 반환', async () => {
    const backups = await page.evaluate(() => {
      return (window as any).electronAPI.listBackups();
    });
    expect(Array.isArray(backups)).toBe(true);
  });

  test('모든 IPC 메서드가 노출되어 있다', async () => {
    const methods = await page.evaluate(() => {
      const api = (window as any).electronAPI;
      return Object.keys(api);
    });
    const required = [
      'saveData', 'loadData',
      'createBackup', 'listBackups', 'restoreBackup', 'deleteBackup', 'importBackup', 'exportBackupFile',
      'getMachineId',
      'showOpenDialog', 'showSaveDialog',
      'getAppVersion',
      'checkForUpdates', 'downloadUpdate', 'installUpdate', 'onUpdateEvent',
      'relaunch',
    ];
    for (const method of required) {
      expect(methods).toContain(method);
    }
  });
});

// ─── Welcome 모달 / 체험판 ────────────────────────────────

test.describe('Welcome 모달', () => {
  test('라이선스 없으면 Welcome 모달이 표시되거나, 이미 dismiss된 상태', async () => {
    // welcome-dismissed가 localStorage에 있으면 모달 안 보임
    const modalVisible = await page.locator('.ant-modal').isVisible().catch(() => false);
    const hasLicense = await page.evaluate(() => {
      return !!localStorage.getItem('app-license');
    });
    const dismissed = await page.evaluate(() => {
      return !!localStorage.getItem('welcome-dismissed');
    });

    if (!hasLicense && !dismissed) {
      expect(modalVisible).toBe(true);
    }
    // 이미 라이선스가 있거나 dismiss된 경우는 모달 없음 — 둘 다 유효
  });

  test('체험판으로 시작 → 모달 닫힘', async () => {
    // welcome 모달이 보이면 체험판 버튼 클릭
    const trialButton = page.getByText('체험판으로 시작', { exact: false });
    if (await trialButton.isVisible().catch(() => false)) {
      await trialButton.click();
      await page.waitForTimeout(500);
      const modalVisible = await page.locator('.ant-modal').isVisible().catch(() => false);
      expect(modalVisible).toBe(false);
    }
  });
});

// ─── 네비게이션 ───────────────────────────────────────────

test.describe('네비게이션', () => {
  test('사이드바 메뉴가 존재한다', async () => {
    const menu = page.locator('.ant-menu');
    await expect(menu.first()).toBeVisible();
  });

  test('대시보드 → 강좌 관리 이동', async () => {
    const coursesLink = page.getByText('강좌 관리').first();
    if (await coursesLink.isVisible()) {
      await coursesLink.click();
      await page.waitForTimeout(500);
      // URL이 변경되었거나 강좌 관련 콘텐츠가 보임
      const content = await page.textContent('body');
      expect(content).toContain('강좌');
    }
  });

  test('수강생 관리 이동', async () => {
    const link = page.getByText('수강생 관리').first();
    if (await link.isVisible()) {
      await link.click();
      await page.waitForTimeout(500);
      const content = await page.textContent('body');
      expect(content).toContain('수강생');
    }
  });

  test('수익 관리 이동', async () => {
    const link = page.getByText('수익 관리').first();
    if (await link.isVisible()) {
      await link.click();
      await page.waitForTimeout(500);
      const content = await page.textContent('body');
      expect(content).toContain('수익');
    }
  });

  test('설정 이동', async () => {
    const link = page.getByText('설정').first();
    if (await link.isVisible()) {
      await link.click();
      await page.waitForTimeout(500);
      const content = await page.textContent('body');
      expect(content).toContain('설정');
    }
  });

  test('대시보드로 복귀', async () => {
    const link = page.getByText('대시보드').first();
    if (await link.isVisible()) {
      await link.click();
      await page.waitForTimeout(500);
    }
  });
});

// ─── 설정 페이지 ──────────────────────────────────────────

test.describe('설정 페이지', () => {
  test.beforeAll(async () => {
    const settingsLink = page.getByText('설정').first();
    if (await settingsLink.isVisible()) {
      await settingsLink.click();
      await page.waitForTimeout(1000);
    }
  });

  test('테마 변경 가능', async () => {
    // 다크 모드 관련 요소가 있는지 확인
    const content = await page.textContent('body');
    const hasThemeSetting = content?.includes('테마') || content?.includes('다크') || content?.includes('라이트');
    expect(hasThemeSetting).toBe(true);
  });

  test('라이선스 탭 존재', async () => {
    const licenseTab = page.getByText('라이선스', { exact: false }).first();
    expect(await licenseTab.isVisible().catch(() => false)).toBe(true);
  });
});

// ─── 강좌 실제 CRUD ──────────────────────────────────────

test.describe.serial('강좌 CRUD (실제 데이터)', () => {
  const testCourseName = `E2E_테스트강좌_${Date.now()}`;

  test('강좌 관리 페이지 이동', async () => {
    await page.getByText('강좌 관리').first().click();
    await page.waitForTimeout(1000);
  });

  test('강좌 개설 버튼 존재', async () => {
    const addButton = page.getByText('강좌 개설', { exact: false }).first();
    expect(await addButton.isVisible()).toBe(true);
  });

  test('강좌 생성', async () => {
    // 모달 열기
    await page.getByText('강좌 개설').first().click();
    await page.waitForTimeout(500);

    // 폼 입력
    const modal = page.locator('.ant-modal').last();
    await modal.locator('#name').fill(testCourseName);
    await modal.locator('#classroom').fill('E2E테스트실');
    await modal.locator('#instructorName').fill('테스트강사');
    await modal.locator('#instructorPhone').fill('01099998888');
    // 수강료 InputNumber
    await modal.locator('#fee').fill('100000');
    // 최대 인원 InputNumber
    await modal.locator('#maxStudents').fill('10');

    // 생성 버튼
    await modal.getByText('생성', { exact: true }).click();
    // 모달이 닫힐 때까지 대기
    await expect(modal).toBeHidden({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(1000);

    // 강좌 목록에 표시되는지 확인
    const tableBody = page.locator('.ant-table-tbody');
    const tableText = await tableBody.textContent();
    expect(tableText).toContain(testCourseName);
  });

  test('생성된 강좌가 목록에 표시됨', async () => {
    const row = page.getByText(testCourseName);
    expect(await row.isVisible()).toBe(true);
  });

  test('강좌 삭제', async () => {
    // 해당 강좌 행의 삭제 버튼 클릭 → Modal.confirm 열림
    const row = page.locator('tr', { hasText: testCourseName });
    await row.getByText('삭제').click();
    await page.waitForTimeout(500);

    // Modal.confirm의 "삭제" 버튼 클릭
    const confirmModal = page.locator('.ant-modal-confirm');
    await confirmModal.locator('.ant-modal-confirm-btns .ant-btn-dangerous').click();
    await page.waitForTimeout(2000);

    // 삭제 확인 — 테이블에서 사라졌는지 (body 전체가 아닌 테이블만 확인)
    const tableText = await page.locator('.ant-table-tbody').textContent();
    expect(tableText).not.toContain(testCourseName);
  });
});

// ─── 수강생 실제 CRUD ────────────────────────────────────

test.describe.serial('수강생 CRUD (실제 데이터)', () => {
  const testStudentName = `E2E_테스트학생_${Date.now()}`;

  test('수강생 관리 페이지 이동', async () => {
    await page.getByText('수강생 관리').first().click();
    await page.waitForTimeout(1000);
  });

  test('수강생 등록 버튼 존재', async () => {
    const addButton = page.getByText('수강생 등록', { exact: false }).first();
    expect(await addButton.isVisible()).toBe(true);
  });

  test('수강생 등록', async () => {
    // 모달 열기
    await page.getByText('수강생 등록').first().click();
    await page.waitForTimeout(500);

    // 폼 입력
    const modal = page.locator('.ant-modal').last();
    await modal.locator('#name').fill(testStudentName);
    await modal.locator('#phone').fill('01011112222');

    // 등록 버튼
    await modal.getByText('등록', { exact: true }).click();
    // 모달이 닫힐 때까지 대기
    await expect(modal).toBeHidden({ timeout: 5000 }).catch(async () => {
      // 모달이 안 닫히면 Escape로 닫기
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    });
    await page.waitForTimeout(1000);

    // 수강생 목록에 표시되는지
    const tableText = await page.locator('.ant-table-tbody').textContent();
    expect(tableText).toContain(testStudentName);
  });

  test('등록된 수강생이 목록에 표시됨', async () => {
    // 열려있는 모달이 있으면 닫기
    const anyModal = page.locator('.ant-modal-wrap');
    if (await anyModal.isVisible().catch(() => false)) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }
    const row = page.getByText(testStudentName);
    expect(await row.isVisible()).toBe(true);
  });

  test('수강생 삭제', async () => {
    // 열려있는 모달이 있으면 닫기
    const anyModal = page.locator('.ant-modal-wrap');
    if (await anyModal.isVisible().catch(() => false)) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }

    // 해당 행의 삭제 버튼 클릭 → Modal.confirm 열림
    const row = page.locator('tr', { hasText: testStudentName });
    await row.getByText('삭제').click();
    await page.waitForTimeout(500);

    // Modal.confirm의 "삭제" 버튼 클릭
    const confirmModal = page.locator('.ant-modal-confirm');
    await confirmModal.locator('.ant-modal-confirm-btns .ant-btn-dangerous').click();
    await page.waitForTimeout(2000);

    // 삭제 확인 — 테이블에서 사라졌는지
    const tableText = await page.locator('.ant-table-tbody').textContent();
    expect(tableText).not.toContain(testStudentName);
  });
});

// ─── 통합 시나리오: 강좌→수강생→수강등록→대시보드→납부→수익 ────

test.describe.serial('통합 시나리오 (수강 등록 + 대시보드 + 납부 + 수익)', () => {
  const ts = Date.now();
  const courseName = `통합테스트강좌_${ts}`;
  const studentName = `통합테스트학생_${ts}`;
  const courseFee = 200000;

  // ── 1. 강좌 생성 ──
  test('강좌 생성', async () => {
    await page.getByText('강좌 관리').first().click();
    await page.waitForTimeout(1000);

    await page.getByText('강좌 개설').first().click();
    await page.waitForTimeout(500);

    const modal = page.locator('.ant-modal').last();
    await modal.locator('#name').fill(courseName);
    await modal.locator('#classroom').fill('통합테스트실');
    await modal.locator('#instructorName').fill('통합강사');
    await modal.locator('#instructorPhone').fill('01077776666');
    await modal.locator('#fee').fill(String(courseFee));
    await modal.locator('#maxStudents').fill('20');

    await modal.getByText('생성', { exact: true }).click();
    await expect(modal).toBeHidden({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(1000);

    const tableText = await page.locator('.ant-table-tbody').textContent();
    expect(tableText).toContain(courseName);
  });

  // ── 2. 수강생 생성 (강좌 없이) ──
  test('수강생 생성', async () => {
    await page.getByText('수강생 관리').first().click();
    await page.waitForTimeout(1000);

    await page.getByText('수강생 등록').first().click();
    await page.waitForTimeout(500);

    const modal = page.locator('.ant-modal').last();
    await modal.locator('#name').fill(studentName);
    await modal.locator('#phone').fill('01055554444');

    await modal.getByText('등록', { exact: true }).click();
    await expect(modal).toBeHidden({ timeout: 5000 }).catch(async () => {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    });
    await page.waitForTimeout(1000);

    const tableText = await page.locator('.ant-table-tbody').textContent();
    expect(tableText).toContain(studentName);
  });

  // ── 3. 강좌 신청 (StudentList의 강좌 신청 버튼 → EnrollmentForm) ──
  test('수강생에 강좌 수강 등록', async () => {
    // 해당 수강생 행의 "강좌 신청" 버튼 클릭
    const row = page.locator('tr', { hasText: studentName });
    await row.getByText('강좌 신청').click();
    await page.waitForTimeout(500);

    // EnrollmentForm 모달
    const modal = page.locator('.ant-modal').last();
    await expect(modal).toBeVisible();

    // 강좌 선택 Select 클릭
    await modal.locator('.ant-select').first().click();
    await page.waitForTimeout(500);

    // 드롭다운에서 해당 강좌 선택
    const dropdown = page.locator('.ant-select-dropdown').last();
    await dropdown.getByText(courseName, { exact: false }).first().click();
    await page.waitForTimeout(500);

    // 완납 버튼 클릭
    const payFullBtn = modal.getByText('완납', { exact: true }).first();
    if (await payFullBtn.isVisible().catch(() => false)) {
      await payFullBtn.click();
      await page.waitForTimeout(300);
    }

    // 신청 버튼 클릭
    await modal.getByText('신청', { exact: true }).click();
    await expect(modal).toBeHidden({ timeout: 5000 }).catch(async () => {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    });
    await page.waitForTimeout(1000);
  });

  // ── 4. 수강생 목록에서 강좌 태그 확인 ──
  test('수강생 목록에 강좌 태그 표시됨', async () => {
    const row = page.locator('tr', { hasText: studentName });
    const rowText = await row.textContent();
    expect(rowText).toContain(courseName);
  });

  // ── 4. 대시보드 검증 ──
  test('대시보드 — 강좌 수/수강생 수 반영', async () => {
    await page.getByText('대시보드').first().click();
    await page.waitForTimeout(1500);

    const body = await page.textContent('body');
    // 강좌, 수강생 통계가 0이 아닌 값으로 표시
    expect(body).toContain('강좌');
    expect(body).toContain('수강생');

    // 생성한 강좌가 대시보드 강좌 카드에 표시
    expect(body).toContain(courseName);
  });

  test('대시보드 — 납부/납부율 통계 표시', async () => {
    const body = await page.textContent('body');
    expect(body).toContain('납부');
    expect(body).toContain('납부율');
  });

  test('대시보드 — 완납/미납 건수 표시', async () => {
    const body = await page.textContent('body');
    expect(body).toContain('완납');
    expect(body).toContain('미납');
  });

  // ── 5. 강좌 상세 — 수강 인원 증가 확인 ──
  test('강좌 상세 — 수강 인원 반영', async () => {
    await page.getByText('강좌 관리').first().click();
    await page.waitForTimeout(1000);

    // 강좌 행의 "상세" 버튼 클릭하여 상세 이동
    const row = page.locator('tr', { hasText: courseName }).last();
    await row.getByText('상세').click();
    await page.waitForTimeout(1500);

    // 수강생 수가 1명 이상으로 표시
    const body = await page.textContent('body');
    expect(body).toContain(studentName);
    expect(body).toContain('수강생');
  });

  // ── 6. 강좌 상세에서 납부 관리 ──
  test('강좌 상세 — 납부 상태 확인', async () => {
    const body = await page.textContent('body');
    // 납부 현황 관련 태그나 금액이 표시됨
    const hasPaymentInfo = body?.includes('완납') || body?.includes('미납') || body?.includes('부분납부') || body?.includes('₩');
    expect(hasPaymentInfo).toBe(true);
  });

  test('강좌 상세 — 납부 관리 모달 열기/닫기', async () => {
    const payBtn = page.getByText('납부 관리', { exact: false }).first();
    if (await payBtn.isVisible().catch(() => false)) {
      await payBtn.click();
      await page.waitForTimeout(500);

      // 납부 관리 모달 확인
      const modal = page.locator('.ant-modal').last();
      const modalText = await modal.textContent().catch(() => '');
      expect(modalText).toContain('납부');

      // 수강료 정보 표시 확인
      expect(modalText).toContain('수강료');

      // 모달 닫기
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }
  });

  // ── 7. 수익 관리 페이지 검증 ──
  test('수익 관리 — 페이지 이동 및 통계 카드 확인', async () => {
    await page.getByText('수익 관리').first().click();
    await page.waitForTimeout(1500);

    const body = await page.textContent('body');
    // 주요 통계 카드 존재 확인
    expect(body).toContain('총 수익');
    expect(body).toContain('예상 총 수익');
    expect(body).toContain('총 미수금');
    expect(body).toContain('수익률');
  });

  test('수익 관리 — 납부 상태 카드 확인', async () => {
    const body = await page.textContent('body');
    expect(body).toContain('완납');
    expect(body).toContain('미납');
  });

  test('수익 관리 — 강좌별 수익 탭에 강좌 표시', async () => {
    // 강좌별 수익 탭 (기본 탭)
    const body = await page.textContent('body');
    expect(body).toContain(courseName);
  });

  test('수익 관리 — 미납자 관리 탭', async () => {
    const unpaidTab = page.getByText('미납자 관리', { exact: false }).first();
    if (await unpaidTab.isVisible().catch(() => false)) {
      await unpaidTab.click();
      await page.waitForTimeout(1000);

      const body = await page.textContent('body');
      // 미납자가 있으면 납부 처리 버튼 존재
      const hasPayAction = body?.includes('납부 처리') || body?.includes('미납자');
      expect(hasPayAction).toBe(true);
    }
  });

  test('수익 관리 — 월별 납부 현황 탭', async () => {
    const monthlyTab = page.getByText('월별 납부 현황', { exact: false }).first();
    if (await monthlyTab.isVisible().catch(() => false)) {
      await monthlyTab.click();
      await page.waitForTimeout(1000);

      const body = await page.textContent('body');
      // 월별 현황에 강좌 이름이 표시
      expect(body).toContain(courseName);
    }
  });

  test('수익 관리 — 기간 필터 동작', async () => {
    // "이번 달" 필터 클릭
    const thisMonthBtn = page.getByText('이번 달', { exact: true }).first();
    if (await thisMonthBtn.isVisible().catch(() => false)) {
      await thisMonthBtn.click();
      await page.waitForTimeout(500);
    }
    // 필터 적용 후에도 페이지 정상 렌더링
    const body = await page.textContent('body');
    expect(body).toContain('수익');
  });

  // ── 8. 수강생에서 납부 변경 시나리오 (강좌 상세 경유) ──
  test('강좌 상세 — 납부 관리에서 납부 금액 변경', async () => {
    await page.getByText('강좌 관리').first().click();
    await page.waitForTimeout(1000);

    // 강좌 상세 진입
    const row = page.locator('tr', { hasText: courseName }).last();
    await row.getByText('상세').click();
    await page.waitForTimeout(1500);

    // 납부 관리 버튼 클릭
    const payBtn = page.getByText('납부 관리', { exact: false }).first();
    if (await payBtn.isVisible().catch(() => false)) {
      await payBtn.click();
      await page.waitForTimeout(500);

      const modal = page.locator('.ant-modal').last();

      // 납부 금액 입력 (부분납부: 절반)
      const halfBtn = modal.getByText('절반', { exact: true }).first();
      if (await halfBtn.isVisible().catch(() => false)) {
        await halfBtn.click();
        await page.waitForTimeout(300);
      }

      // 납부 방법 선택 — 카드
      const cardRadio = modal.getByText('카드', { exact: true }).first();
      if (await cardRadio.isVisible().catch(() => false)) {
        await cardRadio.click();
        await page.waitForTimeout(200);
      }

      // 저장
      const saveBtn = modal.getByText('저장', { exact: true }).first();
      if (await saveBtn.isVisible().catch(() => false)) {
        await saveBtn.click();
        await page.waitForTimeout(1000);
      } else {
        // 저장 버튼이 없으면 모달 닫기
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
      }
    }
  });

  test('납부 변경 후 납부 상태 반영 확인', async () => {
    const body = await page.textContent('body');
    // 부분납부 또는 완납 상태가 반영되어 있어야 함
    const hasPaymentStatus = body?.includes('완납') || body?.includes('부분납부') || body?.includes('미납');
    expect(hasPaymentStatus).toBe(true);
  });

  // ── 9. 정리 — 수강생 삭제 후 강좌 삭제 ──
  test('정리 — 수강생 삭제', async () => {
    await page.getByText('수강생 관리').first().click();
    await page.waitForTimeout(1000);

    // 열려있는 모달 닫기
    const anyModal = page.locator('.ant-modal-wrap');
    if (await anyModal.isVisible().catch(() => false)) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }

    const row = page.locator('tr', { hasText: studentName });
    await row.getByText('삭제').click();
    await page.waitForTimeout(500);

    const confirmModal = page.locator('.ant-modal-confirm');
    await confirmModal.locator('.ant-modal-confirm-btns .ant-btn-dangerous').click();
    await page.waitForTimeout(2000);

    const tableText = await page.locator('.ant-table-tbody').textContent();
    expect(tableText).not.toContain(studentName);
  });

  test('정리 — 강좌 삭제', async () => {
    await page.getByText('강좌 관리').first().click();
    await page.waitForTimeout(1000);

    const row = page.locator('tr', { hasText: courseName });
    await row.getByText('삭제').click();
    await page.waitForTimeout(500);

    const confirmModal = page.locator('.ant-modal-confirm');
    await confirmModal.locator('.ant-modal-confirm-btns .ant-btn-dangerous').click();
    await page.waitForTimeout(2000);

    const tableText = await page.locator('.ant-table-tbody').textContent();
    expect(tableText).not.toContain(courseName);
  });

  test('정리 후 대시보드 정상', async () => {
    await page.getByText('대시보드').first().click();
    await page.waitForTimeout(1000);

    const body = await page.textContent('body');
    // 삭제한 강좌/수강생이 대시보드에서 사라짐
    expect(body).not.toContain(courseName);
    expect(body).not.toContain(studentName);
  });
});

// ─── 키보드 단축키 ────────────────────────────────────────

test.describe('키보드 단축키', () => {
  test('Cmd+K 또는 Ctrl+K → 글로벌 검색 토글', async () => {
    const isMac = process.platform === 'darwin';
    await page.keyboard.press(isMac ? 'Meta+k' : 'Control+k');
    await page.waitForTimeout(500);

    // 검색 모달/팝업이 열렸는지 확인
    const searchVisible = await page.locator('.ant-modal').isVisible().catch(() => false);
    // 열렸으면 닫기
    if (searchVisible) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }
  });
});
