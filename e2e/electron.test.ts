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
    await page.waitForTimeout(2000);

    // 강좌 목록에 표시되는지 확인
    const content = await page.textContent('body');
    expect(content).toContain(testCourseName);
  });

  test('생성된 강좌가 목록에 표시됨', async () => {
    const row = page.getByText(testCourseName);
    expect(await row.isVisible()).toBe(true);
  });

  test('강좌 삭제', async () => {
    // 해당 강좌 행의 삭제 버튼 찾기
    const row = page.locator('tr', { hasText: testCourseName });
    // 작업 버튼 (드롭다운이나 삭제 버튼)
    const actionBtn = row.locator('button').last();
    if (await actionBtn.isVisible()) {
      await actionBtn.click();
      await page.waitForTimeout(300);
    }

    // 삭제 메뉴 항목 클릭
    const deleteOption = page.getByText('삭제', { exact: false }).last();
    if (await deleteOption.isVisible().catch(() => false)) {
      await deleteOption.click();
      await page.waitForTimeout(300);
    }

    // 확인 모달
    const confirmBtn = page.locator('.ant-popconfirm-buttons button, .ant-modal-confirm-btns button')
      .getByText('확인', { exact: false })
      .or(page.locator('.ant-popconfirm-buttons .ant-btn-primary'))
      .first();
    if (await confirmBtn.isVisible().catch(() => false)) {
      await confirmBtn.click();
      await page.waitForTimeout(2000);
    }

    // 삭제 확인 — 목록에서 사라졌는지
    const content = await page.textContent('body');
    expect(content).not.toContain(testCourseName);
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
    await page.waitForTimeout(2000);

    // 수강생 목록에 표시되는지
    const content = await page.textContent('body');
    expect(content).toContain(testStudentName);
  });

  test('등록된 수강생이 목록에 표시됨', async () => {
    const row = page.getByText(testStudentName);
    expect(await row.isVisible()).toBe(true);
  });

  test('수강생 삭제', async () => {
    // 해당 행의 삭제 버튼
    const row = page.locator('tr', { hasText: testStudentName });
    const actionBtn = row.locator('button').last();
    if (await actionBtn.isVisible()) {
      await actionBtn.click();
      await page.waitForTimeout(300);
    }

    const deleteOption = page.getByText('삭제', { exact: false }).last();
    if (await deleteOption.isVisible().catch(() => false)) {
      await deleteOption.click();
      await page.waitForTimeout(300);
    }

    // 확인
    const confirmBtn = page.locator('.ant-popconfirm-buttons button, .ant-modal-confirm-btns button')
      .getByText('확인', { exact: false })
      .or(page.locator('.ant-popconfirm-buttons .ant-btn-primary'))
      .first();
    if (await confirmBtn.isVisible().catch(() => false)) {
      await confirmBtn.click();
      await page.waitForTimeout(2000);
    }

    const content = await page.textContent('body');
    expect(content).not.toContain(testStudentName);
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
