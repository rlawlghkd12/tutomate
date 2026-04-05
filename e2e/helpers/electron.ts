/**
 * Electron E2E 테스트 헬퍼
 *
 * 사전 조건:
 *   1. supabase start
 *   2. pnpm test:e2e:setup (세션 파일 생성)
 *   3. dist-electron/main.js가 존재 (pnpm --filter @tutomate/app dev 한 번 실행)
 *
 * Electron을 .env.test 환경으로 실행하여 로컬 Supabase에 연결한다.
 * 세션은 main process의 executeJavaScript로 주입한다.
 */
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { E2ESession } from '../setup';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const APP_DIR = path.join(PROJECT_ROOT, 'apps/tutomate');

/**
 * 저장된 E2E 세션 파일 로드
 */
export function loadSession(): E2ESession {
  const sessionPath = path.join(PROJECT_ROOT, 'e2e', '.e2e-session.json');
  if (!fs.existsSync(sessionPath)) {
    throw new Error(
      'E2E 세션 파일이 없습니다. 먼저 "pnpm test:e2e:setup" 을 실행하세요.',
    );
  }
  return JSON.parse(fs.readFileSync(sessionPath, 'utf-8'));
}

/**
 * Electron 앱을 실행하고 로컬 Supabase 세션을 주입한 뒤 Page 객체를 반환한다.
 */
export async function launchApp(): Promise<{ app: ElectronApplication; page: Page }> {
  const session = loadSession();

  // Electron 실행 — dist/index.html을 로드하되, 로컬 Supabase 환경변수 주입
  // dist는 프로덕션 빌드이므로 환경변수가 번들에 하드코딩됨.
  // 따라서 .env.test로 빌드된 dist가 필요함.
  // → 대안: Electron의 webPreferences.preload에서 window.__SUPABASE_URL__ 같은 변수를 주입
  // → 가장 간단한 방법: 렌더러 프로세스 로드 후 JS로 Supabase 세션을 직접 세팅

  const app = await electron.launch({
    args: [path.join(APP_DIR, 'dist-electron/main.js')],
    env: {
      ...process.env,
      // .env.test 환경변수를 직접 전달 (main process에서는 사용 안 하지만 기록용)
      VITE_SUPABASE_URL: session.supabase_url,
      VITE_SUPABASE_ANON_KEY: session.supabase_anon_key,
    },
  });

  const page = await app.firstWindow();
  await page.waitForLoadState('load');
  await page.waitForTimeout(3000);

  // ── 세션 주입 (main process → executeJavaScript) ──────────
  // 렌더러의 Supabase 클라이언트가 가리키는 URL이 프로덕션이므로,
  // localStorage에 프로덕션 ref 키로 세션을 저장한다.
  // 앱이 로컬 Supabase를 쓰려면 빌드 시 .env.test가 필요.
  // 여기서는 "이미 로그인된 것처럼" authStore 상태를 직접 오버라이드한다.
  const injectResult = await app.evaluate(async ({ BrowserWindow }, sd) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return 'no window';
    try {
      // authStore의 Zustand persist 키를 찾아서 세팅
      const result = await win.webContents.executeJavaScript(`
        (function() {
          try {
            // Supabase URL에서 ref 추출
            var supabaseUrl = '${sd.supabaseUrl}';
            var ref = supabaseUrl.replace('https://', '').replace('http://', '').split('.')[0].split(':')[0];
            var storageKey = 'sb-' + ref + '-auth-token';
            var payload = JSON.stringify({
              access_token: '${sd.accessToken}',
              refresh_token: '${sd.refreshToken}',
              token_type: 'bearer',
              expires_in: 3600,
              expires_at: Math.floor(Date.now() / 1000) + 3600
            });
            localStorage.setItem(storageKey, payload);
            return 'set:' + storageKey;
          } catch(e) {
            return 'error:' + e.message;
          }
        })()
      `);
      return result;
    } catch (e: any) {
      return 'eval-error:' + e.message;
    }
  }, {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    supabaseUrl: session.supabase_url,
  });

  console.log('[e2e] 세션 주입 결과:', injectResult);

  // 세션 주입 후 새로고침
  await page.reload();
  await page.waitForLoadState('load');
  await page.waitForTimeout(3000);

  // 사이드바가 보일 때까지 대기
  try {
    await page.waitForSelector('text=대시보드', { timeout: 15000 });
  } catch {
    // 실패 시 스크린샷 저장
    await page.screenshot({ path: path.join(PROJECT_ROOT, 'e2e/screenshots/login-fail.png') });
    const bodyText = await app.evaluate(async ({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (!win) return 'no window';
      return await win.webContents.executeJavaScript('document.body.innerText.substring(0, 300)');
    });
    throw new Error(`로그인 실패. 화면 내용: ${bodyText}`);
  }

  return { app, page };
}

/**
 * 사이드바 네비게이션 클릭
 */
export async function navigateTo(page: Page, menuText: string): Promise<void> {
  // Dialog overlay가 남아있으면 ESC로 닫기
  try {
    const overlay = page.locator('[data-state="open"][aria-hidden="true"]');
    if (await overlay.count() > 0) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }
  } catch { /* ignore */ }
  await page.locator(`nav button:has-text("${menuText}")`).click();
  await page.waitForTimeout(1000);
}
