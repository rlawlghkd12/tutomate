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
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── 로컬 Supabase 설정 ──────────────────────────────────
const SUPABASE_URL = 'http://127.0.0.1:54321';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SUPABASE_SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Offtlna7DBLCqnTbM';

const TEST_EMAIL = 'e2e-test@tutomate.local';
const TEST_PASSWORD = 'e2e-test-password-123!';
const TEST_ORG_NAME = 'E2E 테스트 학원';
const TEST_LICENSE_KEY = 'E2E-TEST-LICENSE-0001';

// service_role 권한 클라이언트 (admin API 사용)
const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// anon 클라이언트 (일반 사용자 로그인용)
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

  // ── 1. 기존 테스트 유저 정리 ─────────────────────────────
  const { data: existingUsers } = await adminClient.auth.admin.listUsers();
  const existingUser = existingUsers?.users?.find((u) => u.email === TEST_EMAIL);

  if (existingUser) {
    console.log('[e2e:setup] 기존 테스트 유저 삭제:', existingUser.id);
    // 연결된 조직 데이터 먼저 삭제
    await adminClient.from('user_organizations').delete().eq('user_id', existingUser.id);
    await adminClient.auth.admin.deleteUser(existingUser.id);
  }

  // 기존 테스트 조직 정리
  await adminClient.from('organizations').delete().eq('license_key', TEST_LICENSE_KEY);

  // ── 2. 테스트 유저 생성 ───────────────────────────────────
  console.log('[e2e:setup] 테스트 유저 생성...');
  const { data: newUser, error: userError } = await adminClient.auth.admin.createUser({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    email_confirm: true,
  });

  if (userError || !newUser.user) {
    throw new Error(`테스트 유저 생성 실패: ${userError?.message}`);
  }

  const userId = newUser.user.id;
  console.log('[e2e:setup] 유저 생성 완료:', userId);

  // ── 3. 테스트 조직 생성 ───────────────────────────────────
  console.log('[e2e:setup] 테스트 조직 생성...');
  const { data: org, error: orgError } = await adminClient
    .from('organizations')
    .insert({
      name: TEST_ORG_NAME,
      license_key: TEST_LICENSE_KEY,
      plan: 'basic',
      max_seats: 10,
    })
    .select()
    .single();

  if (orgError || !org) {
    throw new Error(`조직 생성 실패: ${orgError?.message}`);
  }

  const organizationId = org.id as string;
  console.log('[e2e:setup] 조직 생성 완료:', organizationId);

  // ── 4. 유저 - 조직 연결 ───────────────────────────────────
  console.log('[e2e:setup] 유저-조직 연결...');
  const { error: linkError } = await adminClient.from('user_organizations').insert({
    user_id: userId,
    organization_id: organizationId,
  });

  if (linkError) {
    throw new Error(`유저-조직 연결 실패: ${linkError.message}`);
  }

  // ── 5. 로그인하여 세션 토큰 획득 ──────────────────────────
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

  // ── 6. 세션 파일로 저장 ───────────────────────────────────
  const sessionPath = path.join(__dirname, '.e2e-session.json');
  fs.writeFileSync(sessionPath, JSON.stringify(session, null, 2));
  console.log('[e2e:setup] 세션 저장 완료:', sessionPath);
  console.log('[e2e:setup] 설정 완료!');

  return session;
}

/**
 * 테스트 후 정리: 테스트 유저 + 조직 + 관련 데이터 삭제
 */
export async function teardown(): Promise<void> {
  console.log('[e2e:teardown] 테스트 데이터 정리...');

  const sessionPath = path.join(__dirname, '.e2e-session.json');
  if (!fs.existsSync(sessionPath)) {
    console.log('[e2e:teardown] 세션 파일 없음, 스킵');
    return;
  }

  const session: E2ESession = JSON.parse(fs.readFileSync(sessionPath, 'utf-8'));

  // 조직에 속한 데이터 삭제 (CASCADE로 자동 삭제되지만 명시적으로)
  await adminClient.from('payment_records').delete().eq('organization_id', session.organization_id);
  await adminClient.from('enrollments').delete().eq('organization_id', session.organization_id);
  await adminClient.from('students').delete().eq('organization_id', session.organization_id);
  await adminClient.from('courses').delete().eq('organization_id', session.organization_id);
  await adminClient.from('user_organizations').delete().eq('user_id', session.user_id);
  await adminClient.from('organizations').delete().eq('id', session.organization_id);
  await adminClient.auth.admin.deleteUser(session.user_id);

  // 세션 파일 삭제
  fs.unlinkSync(sessionPath);
  console.log('[e2e:teardown] 정리 완료');
}

// 직접 실행 시
setup().catch((err) => {
  console.error('[e2e:setup] 실패:', err);
  process.exit(1);
});
