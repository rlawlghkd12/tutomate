/**
 * Electron E2E 테스트 헬퍼
 *
 * - Electron 앱 실행
 * - 로컬 Supabase 세션 주입
 * - 앱 초기화 대기
 */
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { E2ESession } from '../setup';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../..');

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
 *
 * @returns { app, page } - Electron 앱과 렌더러 페이지
 */
export async function launchApp(): Promise<{ app: ElectronApplication; page: Page }> {
  const session = loadSession();

  const app = await electron.launch({
    args: [path.join(PROJECT_ROOT, 'apps/tutomate/dist-electron/main.js')],
    env: {
      ...process.env,
      NODE_ENV: 'production',
      // Vite 빌드된 앱은 .env를 읽지만, Electron main process 환경변수로 오버라이드
      VITE_SUPABASE_URL: session.supabase_url,
      VITE_SUPABASE_ANON_KEY: session.supabase_anon_key,
    },
  });

  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');

  // ── 세션 주입 ──────────────────────────────────────────────
  // 렌더러 프로세스의 Supabase 클라이언트에 세션을 직접 설정
  await page.evaluate(
    async ({ url, anonKey, accessToken, refreshToken }) => {
      // Supabase JS client가 localStorage에 세션을 저장하므로,
      // sb-<ref>-auth-token 키에 직접 주입한다.
      // 로컬 Supabase의 ref는 URL에서 추출 (127.0.0.1 -> 'local')
      const storageKey = `sb-127.0.0.1-auth-token`;
      const sessionPayload = {
        access_token: accessToken,
        refresh_token: refreshToken,
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      };
      localStorage.setItem(storageKey, JSON.stringify(sessionPayload));

      // Supabase 클라이언트가 이미 초기화되어 있다면, setSession 호출
      try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(url, anonKey, {
          auth: { persistSession: true, autoRefreshToken: false },
        });
        await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
      } catch {
        // import 실패 시 localStorage 기반으로 대체
      }
    },
    {
      url: session.supabase_url,
      anonKey: session.supabase_anon_key,
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
    },
  );

  // 세션 주입 후 앱 새로고침으로 initialize() 재실행
  await page.reload();
  await page.waitForLoadState('domcontentloaded');

  // ── 앱 완전 로드 대기 ──────────────────────────────────────
  // 사이드바의 네비게이션 항목이 보일 때까지 대기 (로그인 + 조직 로드 완료 의미)
  await page.waitForSelector('text=대시보드', { timeout: 15000 });

  return { app, page };
}

/**
 * 사이드바 네비게이션 클릭
 */
export async function navigateTo(page: Page, menuText: string): Promise<void> {
  await page.getByText(menuText).first().click();
  // 페이지 전환 대기
  await page.waitForTimeout(500);
}
