/**
 * E2E 테스트 사전 설정 스크립트
 *
 * 로컬 Supabase에 테스트 유저 + 조직을 생성하고 세션 토큰을 파일로 내보낸다.
 * 실행: npx tsx e2e/setup.ts
 *
 * 사전 조건:
 *   - supabase start 로 로컬 Supabase 가동 중 (http://127.0.0.1:54321)
 */
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── 로컬 Supabase 설정 ──────────────────────────────────
const SUPABASE_URL = 'http://127.0.0.1:54321';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const DB_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

const TEST_EMAIL = 'e2e-test@tutomate.local';
const TEST_PASSWORD = 'e2e-test-password-123!';
const TEST_ORG_NAME = 'E2E 테스트 학원';
const TEST_LICENSE_KEY = 'E2E-TEST-LICENSE-0001';

const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export interface E2ESession {
  access_token: string;
  refresh_token: string;
  user_id: string;
  organization_id: string;
  supabase_url: string;
  supabase_anon_key: string;
}

async function setup(): Promise<E2ESession> {
  console.log('[e2e:setup] 로컬 Supabase 연결 확인...');

  // DB 직접 접속으로 정리 + 조직 생성
  const client = new pg.Client(DB_URL);
  await client.connect();

  // ── 1. 기존 테스트 데이터 정리 ─────────────────────────
  console.log('[e2e:setup] 기존 테스트 데이터 정리...');
  // 기존 테스트 조직의 데이터 삭제 (cascade)
  await client.query(`DELETE FROM organizations WHERE license_key = $1`, [TEST_LICENSE_KEY]);
  // 기존 테스트 유저 삭제
  await client.query(`DELETE FROM auth.users WHERE email = $1`, [TEST_EMAIL]);

  // ── 2. 테스트 유저 생성 (signup API) ──────────────────
  console.log('[e2e:setup] 테스트 유저 생성...');
  const { data: signUpData, error: signUpError } = await anonClient.auth.signUp({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });

  if (signUpError || !signUpData.user) {
    throw new Error(`테스트 유저 생성 실패: ${signUpError?.message}`);
  }

  const userId = signUpData.user.id;
  console.log('[e2e:setup] 유저 생성 완료:', userId);

  // ── 3. 테스트 조직 생성 (DB 직접) ─────────────────────
  console.log('[e2e:setup] 테스트 조직 생성...');
  const orgResult = await client.query(
    `INSERT INTO organizations (name, license_key, plan, max_seats) VALUES ($1, $2, $3, $4) RETURNING id`,
    [TEST_ORG_NAME, TEST_LICENSE_KEY, 'basic', 10],
  );
  const organizationId = orgResult.rows[0].id as string;
  console.log('[e2e:setup] 조직 생성 완료:', organizationId);

  // ── 4. 유저 - 조직 연결 ───────────────────────────────
  console.log('[e2e:setup] 유저-조직 연결...');
  await client.query(
    `INSERT INTO user_organizations (user_id, organization_id, role) VALUES ($1, $2, $3)`,
    [userId, organizationId, 'owner'],
  );

  await client.end();

  // ── 5. 로그인하여 세션 토큰 획득 ─────────────────────
  console.log('[e2e:setup] 세션 토큰 획득...');
  const { data: signInData, error: signInError } = await anonClient.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });

  if (signInError || !signInData.session) {
    throw new Error(`로그인 실패: ${signInError?.message}`);
  }

  const session: E2ESession = {
    access_token: signInData.session.access_token,
    refresh_token: signInData.session.refresh_token,
    user_id: userId,
    organization_id: organizationId,
    supabase_url: SUPABASE_URL,
    supabase_anon_key: SUPABASE_ANON_KEY,
  };

  // ── 6. 세션 파일 저장 ──────────────────────────────────
  const sessionPath = path.join(__dirname, '.e2e-session.json');
  fs.writeFileSync(sessionPath, JSON.stringify(session, null, 2));
  console.log('[e2e:setup] 세션 저장:', sessionPath);
  console.log('[e2e:setup] ✅ 완료!');

  return session;
}

setup().catch((err) => {
  console.error('[e2e:setup] 실패:', err);
  process.exit(1);
});
