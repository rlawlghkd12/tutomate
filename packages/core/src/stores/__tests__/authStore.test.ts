// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Mock supabase (vi.hoisted로 hoisting 문제 해결) ──
const {
  mockGetSession,
  mockSignInAnonymously,
  mockSignOut,
  mockOnAuthStateChange,
  mockGetUser,
  mockFunctionsInvoke,
  mockRpc,
  mockFromHandlers,
  createQueryBuilder,
} = vi.hoisted(() => {
  const fns = {
    mockGetSession: vi.fn(),
    mockSignInAnonymously: vi.fn(),
    mockSignOut: vi.fn(),
    mockOnAuthStateChange: vi.fn(),
    mockGetUser: vi.fn(),
    mockFunctionsInvoke: vi.fn(),
    mockRpc: vi.fn(),
    mockFromHandlers: {} as Record<string, any>,
    createQueryBuilder: (resolvedData: unknown = null, resolvedError: unknown = null) => {
      const builder: Record<string, any> = {};
      builder.select = vi.fn().mockReturnValue(builder);
      builder.insert = vi.fn().mockReturnValue(builder);
      builder.update = vi.fn().mockReturnValue(builder);
      builder.delete = vi.fn().mockReturnValue(builder);
      builder.eq = vi.fn().mockReturnValue(builder);
      builder.single = vi.fn().mockResolvedValue({ data: resolvedData, error: resolvedError });
      return builder;
    },
  };
  return fns;
});

vi.mock('../../config/supabase', () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
      signInAnonymously: (...args: unknown[]) => mockSignInAnonymously(...args),
      signOut: (...args: unknown[]) => mockSignOut(...args),
      onAuthStateChange: (...args: unknown[]) => mockOnAuthStateChange(...args),
      getUser: (...args: unknown[]) => mockGetUser(...args),
    },
    from: (table: string) => mockFromHandlers[table] || createQueryBuilder(),
    functions: {
      invoke: (...args: unknown[]) => mockFunctionsInvoke(...args),
    },
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

vi.mock('../../config/appConfig', () => ({
  appConfig: { deviceIdKey: 'test-device-id' },
}));

vi.mock('../../utils/logger', () => ({
  logInfo: vi.fn(),
  logError: vi.fn(),
  logWarn: vi.fn(),
}));

vi.mock('../../utils/tauri', () => ({
  isElectron: () => false,
}));

import { useAuthStore, isCloud, getOrgId, getPlan, isOwner, migrateOrgData, _resetAuthFlags, getAuthProvider, getAuthProviderLabel, getAuthProviderColor } from '../authStore';

// onAuthStateChange는 모듈 로드 시 1회 호출됨 — clearAllMocks 전에 캡처
const authStateCallback = mockOnAuthStateChange.mock.calls[0]?.[0] as
  ((event: string, session: any) => void) | undefined;

const fakeSession = {
  user: { id: 'user-123' },
  access_token: 'fake-token',
} as any;

describe('authStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    _resetAuthFlags();
    useAuthStore.setState({
      session: null,
      organizationId: null,
      role: null,
      plan: null,
      isCloud: false,
      loading: true,
      needsSetup: false,
    });
    Object.keys(mockFromHandlers).forEach((k) => delete mockFromHandlers[k]);
  });

  // ── initialize ──

  describe('initialize', () => {
    it('기존 세션 + 기존 org → session restored', async () => {
      mockGetSession.mockResolvedValue({ data: { session: fakeSession } });

      const orgLinkBuilder = createQueryBuilder({ organization_id: 'org-abc', role: 'owner' });
      const orgBuilder = createQueryBuilder({ plan: 'basic' });
      mockFromHandlers['user_organizations'] = orgLinkBuilder;
      mockFromHandlers['organizations'] = orgBuilder;

      await useAuthStore.getState().initialize();

      const state = useAuthStore.getState();
      expect(state.loading).toBe(false);
      expect(state.isCloud).toBe(true);
      expect(state.organizationId).toBe('org-abc');
      expect(state.role).toBe('owner');
      expect(state.plan).toBe('basic');
      expect(state.session).toBe(fakeSession);

      // 올바른 쿼리 파라미터로 호출됐는지 검증
      expect(orgLinkBuilder.select).toHaveBeenCalledWith('organization_id, role');
      expect(orgLinkBuilder.eq).toHaveBeenCalledWith('user_id', 'user-123');
      expect(orgBuilder.select).toHaveBeenCalledWith('plan');
      expect(orgBuilder.eq).toHaveBeenCalledWith('id', 'org-abc');
    });

    it('세션 없으면 loading: false (로그인 화면 표시)', async () => {
      mockGetSession.mockResolvedValue({ data: { session: null } });

      await useAuthStore.getState().initialize();

      const state = useAuthStore.getState();
      expect(state.loading).toBe(false);
      expect(state.session).toBeNull();
      expect(state.isCloud).toBe(false);
      // anonymous sign-in 호출 안 함
      expect(mockSignInAnonymously).not.toHaveBeenCalled();
    });

    it('anonymous 세션이면 로그아웃 후 로그인 화면 표시', async () => {
      const anonSession = { user: { id: 'anon-1', is_anonymous: true }, access_token: 'anon-token' } as any;
      mockGetSession.mockResolvedValue({ data: { session: anonSession } });
      mockSignOut.mockResolvedValue({ error: null });

      await useAuthStore.getState().initialize();

      const state = useAuthStore.getState();
      expect(state.loading).toBe(false);
      expect(state.session).toBeNull();
      expect(mockSignOut).toHaveBeenCalled();
    });

    it('세션 있지만 org 없으면 needsSetup: true', async () => {
      mockGetSession.mockResolvedValue({ data: { session: fakeSession } });
      mockFromHandlers['user_organizations'] = createQueryBuilder(null);

      await useAuthStore.getState().initialize();

      const state = useAuthStore.getState();
      expect(state.loading).toBe(false);
      expect(state.needsSetup).toBe(true);
      expect(state.session).toBe(fakeSession);
    });

    // ── 자동 재활성화 ──

    it('trial org + 저장된 라이센스 키 → 자동 재활성화 호출', async () => {
      mockGetSession.mockResolvedValue({ data: { session: fakeSession } });
      mockFromHandlers['user_organizations'] = createQueryBuilder({ organization_id: 'trial-org' });
      mockFromHandlers['organizations'] = createQueryBuilder({ plan: 'trial' });

      mockFunctionsInvoke.mockResolvedValue({
        data: { organization_id: 'licensed-org', is_new_org: false, plan: 'basic' },
        error: null,
      });

      localStorage.setItem('app-license', JSON.stringify({ licenseKey: 'TMKH-ABCD-1234-WXYZ' }));

      await useAuthStore.getState().initialize();

      expect(mockFunctionsInvoke).toHaveBeenCalledWith('activate-license', expect.any(Object));
      expect(useAuthStore.getState().organizationId).toBe('licensed-org');
      expect(useAuthStore.getState().plan).toBe('basic');
    });

    it('trial org + 라이센스 없음 → 자동 재활성화 안 함', async () => {
      mockGetSession.mockResolvedValue({ data: { session: fakeSession } });
      mockFromHandlers['user_organizations'] = createQueryBuilder({ organization_id: 'trial-org' });
      mockFromHandlers['organizations'] = createQueryBuilder({ plan: 'trial' });

      await useAuthStore.getState().initialize();

      expect(mockFunctionsInvoke).not.toHaveBeenCalled();
    });

    it('trial org + TMKA 키 → 자동 재활성화 호출 (Admin 키도 매칭)', async () => {
      mockGetSession.mockResolvedValue({ data: { session: fakeSession } });
      mockFromHandlers['user_organizations'] = createQueryBuilder({ organization_id: 'trial-org' });
      mockFromHandlers['organizations'] = createQueryBuilder({ plan: 'trial' });

      mockFunctionsInvoke.mockResolvedValue({
        data: { organization_id: 'admin-org', is_new_org: false, plan: 'admin' },
        error: null,
      });

      localStorage.setItem('app-license', JSON.stringify({ licenseKey: 'TMKA-ABCD-1234-WXYZ' }));

      await useAuthStore.getState().initialize();

      expect(mockFunctionsInvoke).toHaveBeenCalledWith('activate-license', expect.any(Object));
      expect(useAuthStore.getState().plan).toBe('admin');
    });

    it('trial org + 잘못된 형식 라이센스 키 → 자동 재활성화 안 함', async () => {
      mockGetSession.mockResolvedValue({ data: { session: fakeSession } });
      mockFromHandlers['user_organizations'] = createQueryBuilder({ organization_id: 'trial-org' });
      mockFromHandlers['organizations'] = createQueryBuilder({ plan: 'trial' });

      localStorage.setItem('app-license', JSON.stringify({ licenseKey: 'INVALID-KEY' }));

      await useAuthStore.getState().initialize();

      expect(mockFunctionsInvoke).not.toHaveBeenCalled();
    });

    it('기존 org가 basic이면 자동 재활성화 안 함', async () => {
      mockGetSession.mockResolvedValue({ data: { session: fakeSession } });
      mockFromHandlers['user_organizations'] = createQueryBuilder({ organization_id: 'org-abc' });
      mockFromHandlers['organizations'] = createQueryBuilder({ plan: 'basic' });

      localStorage.setItem('app-license', JSON.stringify({ licenseKey: 'TMKH-ABCD-1234-WXYZ' }));

      await useAuthStore.getState().initialize();

      // orgLink 경로에서 state 올바르게 설정됐는지 확인
      const state = useAuthStore.getState();
      expect(state.plan).toBe('basic');
      expect(state.organizationId).toBe('org-abc');
      expect(state.isCloud).toBe(true);
      // plan이 basic이므로 자동 재활성화 안 함
      expect(mockFunctionsInvoke).not.toHaveBeenCalled();
    });

    it('orgData null → plan fallback to trial (자동 재활성화 경로도 진입하지만 localStorage 비어서 무동작)', async () => {
      mockGetSession.mockResolvedValue({ data: { session: fakeSession } });
      mockFromHandlers['user_organizations'] = createQueryBuilder({ organization_id: 'org-abc' });
      mockFromHandlers['organizations'] = createQueryBuilder({ plan: null });

      await useAuthStore.getState().initialize();

      const state = useAuthStore.getState();
      expect(state.plan).toBe('trial');
      expect(state.organizationId).toBe('org-abc');
      expect(state.isCloud).toBe(true);
      // plan이 'trial'이므로 자동 재활성화 코드까지 도달하지만, localStorage 비어서 activateCloud 미호출
      expect(mockFunctionsInvoke).not.toHaveBeenCalled();
    });

    it('자동 재활성화: invalid_key 반환 시 저장된 키 제거', async () => {
      mockGetSession.mockResolvedValue({ data: { session: fakeSession } });
      mockFromHandlers['user_organizations'] = createQueryBuilder({ organization_id: 'trial-org' });
      mockFromHandlers['organizations'] = createQueryBuilder({ plan: 'trial' });

      mockFunctionsInvoke.mockResolvedValue({
        data: { error: 'invalid_key' },
        error: null,
      });

      localStorage.setItem('app-license', JSON.stringify({ licenseKey: 'TMKH-ABCD-1234-WXYZ' }));

      await useAuthStore.getState().initialize();

      expect(localStorage.getItem('app-license')).toBeNull();
      expect(useAuthStore.getState().plan).toBe('trial');
    });

    it('자동 재활성화: max_seats_reached는 키 유지', async () => {
      mockGetSession.mockResolvedValue({ data: { session: fakeSession } });
      mockFromHandlers['user_organizations'] = createQueryBuilder({ organization_id: 'trial-org' });
      mockFromHandlers['organizations'] = createQueryBuilder({ plan: 'trial' });

      mockFunctionsInvoke.mockResolvedValue({
        data: { error: 'max_seats_reached' },
        error: null,
      });

      localStorage.setItem('app-license', JSON.stringify({ licenseKey: 'TMKH-ABCD-1234-WXYZ' }));

      await useAuthStore.getState().initialize();

      expect(localStorage.getItem('app-license')).not.toBeNull();
      expect(useAuthStore.getState().plan).toBe('trial');
    });

    it('자동 재활성화: 깨진 JSON localStorage → 무시하고 trial 유지', async () => {
      mockGetSession.mockResolvedValue({ data: { session: fakeSession } });
      mockFromHandlers['user_organizations'] = createQueryBuilder({ organization_id: 'trial-org' });
      mockFromHandlers['organizations'] = createQueryBuilder({ plan: 'trial' });

      localStorage.setItem('app-license', '{broken-json');

      await useAuthStore.getState().initialize();

      expect(useAuthStore.getState().plan).toBe('trial');
      expect(mockFunctionsInvoke).not.toHaveBeenCalled();
    });

    it('두 번 호출 시 중복 실행 방지', async () => {
      mockGetSession.mockResolvedValue({ data: { session: fakeSession } });
      mockFromHandlers['user_organizations'] = createQueryBuilder({ organization_id: 'org-abc' });
      mockFromHandlers['organizations'] = createQueryBuilder({ plan: 'basic' });

      await useAuthStore.getState().initialize();
      // 두 번째 호출 — _initialized가 true이므로 즉시 리턴
      mockGetSession.mockClear();
      await useAuthStore.getState().initialize();
      expect(mockGetSession).not.toHaveBeenCalled();
    });

    it('user_organizations 쿼리 에러 (PGRST116 아닌) → loading: false', async () => {
      mockGetSession.mockResolvedValue({ data: { session: fakeSession } });
      mockFromHandlers['user_organizations'] = createQueryBuilder(null, { code: 'OTHER_ERROR', message: 'db error' });

      await useAuthStore.getState().initialize();

      const state = useAuthStore.getState();
      expect(state.loading).toBe(false);
      expect(state.isCloud).toBe(false);
    });

    it('getSession 예외 → loading: false', async () => {
      mockGetSession.mockRejectedValue(new Error('unexpected'));

      await useAuthStore.getState().initialize();

      expect(useAuthStore.getState().loading).toBe(false);
    });

    it('자동 재활성화: activateCloud가 error 반환해도 trial 유지', async () => {
      mockGetSession.mockResolvedValue({ data: { session: fakeSession } });
      mockFromHandlers['user_organizations'] = createQueryBuilder({ organization_id: 'trial-org' });
      mockFromHandlers['organizations'] = createQueryBuilder({ plan: 'trial' });

      mockFunctionsInvoke.mockRejectedValue(new Error('network error'));

      localStorage.setItem('app-license', JSON.stringify({ licenseKey: 'TMKH-ABCD-1234-WXYZ' }));

      await useAuthStore.getState().initialize();

      const state = useAuthStore.getState();
      expect(state.organizationId).toBe('trial-org');
      expect(state.plan).toBe('trial');
    });

    it('자동 재활성화: activateCloud 자체가 throw해도 catch로 trial 유지', async () => {
      mockGetSession.mockResolvedValue({ data: { session: fakeSession } });
      mockFromHandlers['user_organizations'] = createQueryBuilder({ organization_id: 'trial-org' });
      mockFromHandlers['organizations'] = createQueryBuilder({ plan: 'trial' });

      localStorage.setItem('app-license', JSON.stringify({ licenseKey: 'TMKH-ABCD-1234-WXYZ' }));

      const originalActivateCloud = useAuthStore.getState().activateCloud;
      useAuthStore.setState({
        activateCloud: () => { throw new Error('unexpected throw'); },
      } as any);

      await useAuthStore.getState().initialize();

      const state = useAuthStore.getState();
      expect(state.organizationId).toBe('trial-org');
      expect(state.plan).toBe('trial');

      useAuthStore.setState({ activateCloud: originalActivateCloud });
    });

    it('role이 member이면 state에 member 저장', async () => {
      mockGetSession.mockResolvedValue({ data: { session: fakeSession } });

      const orgLinkBuilder = createQueryBuilder({ organization_id: 'org-123', role: 'member' });
      const orgBuilder = createQueryBuilder({ plan: 'basic' });
      mockFromHandlers['user_organizations'] = orgLinkBuilder;
      mockFromHandlers['organizations'] = orgBuilder;

      await useAuthStore.getState().initialize();

      expect(useAuthStore.getState().role).toBe('member');
    });
  });

  // ── isOwner ──

  describe('isOwner', () => {
    it('role=owner이면 true', () => {
      useAuthStore.setState({ role: 'owner' });
      expect(isOwner()).toBe(true);
    });

    it('role=member이면 false', () => {
      useAuthStore.setState({ role: 'member' });
      expect(isOwner()).toBe(false);
    });

    it('role=null이면 false', () => {
      useAuthStore.setState({ role: null });
      expect(isOwner()).toBe(false);
    });
  });

  // ── activateCloud ──

  describe('activateCloud', () => {
    beforeEach(() => {
      mockGetSession.mockResolvedValue({ data: { session: fakeSession } });
    });

    it('정상 활성화 → success + state 업데이트', async () => {
      mockFunctionsInvoke.mockResolvedValue({
        data: { organization_id: 'org-new', is_new_org: true, plan: 'basic' },
        error: null,
      });

      const result = await useAuthStore.getState().activateCloud('TMKH-TEST-1234-ABCD');

      expect(result).toEqual({
        status: 'success',
        isNewOrg: true,
        orgChanged: false,
        previousOrgId: null,
      });
      expect(useAuthStore.getState().organizationId).toBe('org-new');
      expect(useAuthStore.getState().plan).toBe('basic');
    });

    it('org 변경 감지 (trial → licensed)', async () => {
      useAuthStore.setState({ organizationId: 'old-trial-org' });
      mockFunctionsInvoke.mockResolvedValue({
        data: { organization_id: 'new-licensed-org', is_new_org: false, plan: 'basic' },
        error: null,
      });

      const result = await useAuthStore.getState().activateCloud('TMKH-TEST-1234-ABCD');

      expect(result).toEqual({
        status: 'success',
        isNewOrg: false,
        orgChanged: true,
        previousOrgId: 'old-trial-org',
      });
    });

    it('max_seats_reached → 해당 status 반환', async () => {
      mockFunctionsInvoke.mockResolvedValue({
        data: { error: 'max_seats_reached' },
        error: null,
      });

      const result = await useAuthStore.getState().activateCloud('TMKH-TEST-1234-ABCD');
      expect(result).toEqual({ status: 'max_seats_reached' });
    });

    it('invalid_key → 해당 status 반환', async () => {
      mockFunctionsInvoke.mockResolvedValue({
        data: { error: 'invalid_key' },
        error: null,
      });

      const result = await useAuthStore.getState().activateCloud('TMKH-TEST-1234-ABCD');
      expect(result).toEqual({ status: 'invalid_key' });
    });

    it('edge function 에러 → error', async () => {
      mockFunctionsInvoke.mockResolvedValue({ data: null, error: new Error('network') });

      const result = await useAuthStore.getState().activateCloud('TMKH-TEST-1234-ABCD');
      expect(result).toEqual({ status: 'error' });
    });

    it('세션 없으면 error 반환', async () => {
      mockGetSession.mockResolvedValue({ data: { session: null } });

      const result = await useAuthStore.getState().activateCloud('TMKH-TEST-1234-ABCD');

      expect(result).toEqual({ status: 'error' });
      expect(mockFunctionsInvoke).not.toHaveBeenCalled();
    });

    it('invalid_format → invalid_key로 매핑', async () => {
      mockFunctionsInvoke.mockResolvedValue({
        data: { error: 'invalid_format' },
        error: null,
      });

      const result = await useAuthStore.getState().activateCloud('TMKH-TEST-1234-ABCD');
      expect(result).toEqual({ status: 'invalid_key' });
    });

    it('data.error 기타 문자열 → error', async () => {
      mockFunctionsInvoke.mockResolvedValue({
        data: { error: 'unknown_server_error' },
        error: null,
      });

      const result = await useAuthStore.getState().activateCloud('TMKH-TEST-1234-ABCD');
      expect(result).toEqual({ status: 'error' });
    });

    it('같은 org로 재활성화 → orgChanged: false', async () => {
      useAuthStore.setState({ organizationId: 'same-org' });
      mockFunctionsInvoke.mockResolvedValue({
        data: { organization_id: 'same-org', is_new_org: false, plan: 'basic' },
        error: null,
      });

      const result = await useAuthStore.getState().activateCloud('TMKH-TEST-1234-ABCD');

      expect(result).toEqual({
        status: 'success',
        isNewOrg: false,
        orgChanged: false,
        previousOrgId: 'same-org',
      });
    });

    it('예외 발생 → error', async () => {
      mockGetSession.mockRejectedValue(new Error('unexpected crash'));

      const result = await useAuthStore.getState().activateCloud('TMKH-TEST-1234-ABCD');
      expect(result).toEqual({ status: 'error' });
    });
  });

  // ── deactivateCloud ──

  describe('deactivateCloud', () => {
    it('org 연결 해제 + sign out + state 초기화', async () => {
      mockGetSession.mockResolvedValue({ data: { session: fakeSession } });
      const deleteBuilder = createQueryBuilder();
      mockFromHandlers['user_organizations'] = deleteBuilder;
      mockSignOut.mockResolvedValue({});

      useAuthStore.setState({
        session: fakeSession,
        organizationId: 'org-abc',
        plan: 'basic',
        isCloud: true,
      });

      await useAuthStore.getState().deactivateCloud();

      // delete가 실제로 호출됐는지 검증
      expect(deleteBuilder.delete).toHaveBeenCalled();
      expect(deleteBuilder.eq).toHaveBeenCalledWith('user_id', 'user-123');

      const state = useAuthStore.getState();
      expect(state.session).toBeNull();
      expect(state.organizationId).toBeNull();
      expect(state.plan).toBeNull();
      expect(state.isCloud).toBe(false);
      expect(mockSignOut).toHaveBeenCalled();
    });

    it('session 없으면 delete 스킵, signOut만 호출', async () => {
      mockGetSession.mockResolvedValue({ data: { session: null } });
      mockSignOut.mockResolvedValue({});

      // delete 호출 감지용 spy builder
      const spyBuilder = createQueryBuilder();
      mockFromHandlers['user_organizations'] = spyBuilder;

      useAuthStore.setState({ isCloud: true, organizationId: 'org-abc' });

      await useAuthStore.getState().deactivateCloud();

      // session이 null이므로 if(session) 블록 진입 안 함 → delete 미호출
      expect(spyBuilder.delete).not.toHaveBeenCalled();
      expect(mockSignOut).toHaveBeenCalled();
      expect(useAuthStore.getState().isCloud).toBe(false);
    });

    it('delete 실패해도 signOut + state 초기화 진행', async () => {
      mockGetSession.mockResolvedValue({ data: { session: fakeSession } });
      mockSignOut.mockResolvedValue({});

      // delete().eq().then() 에서 예외 발생하도록 설정
      const failBuilder: Record<string, any> = {};
      failBuilder.select = vi.fn().mockReturnValue(failBuilder);
      failBuilder.insert = vi.fn().mockReturnValue(failBuilder);
      failBuilder.delete = vi.fn().mockReturnValue(failBuilder);
      failBuilder.eq = vi.fn().mockRejectedValue(new Error('delete failed'));
      mockFromHandlers['user_organizations'] = failBuilder;

      useAuthStore.setState({ isCloud: true });

      await useAuthStore.getState().deactivateCloud();

      // delete 실패해도 signOut + state 초기화 진행
      expect(failBuilder.delete).toHaveBeenCalled();
      expect(mockSignOut).toHaveBeenCalled();
      expect(useAuthStore.getState().isCloud).toBe(false);
    });

    it('signOut 실패해도 state 초기화 진행', async () => {
      mockGetSession.mockResolvedValue({ data: { session: fakeSession } });
      mockFromHandlers['user_organizations'] = createQueryBuilder();
      mockSignOut.mockRejectedValue(new Error('signOut fail'));

      useAuthStore.setState({ isCloud: true, organizationId: 'org-abc' });

      await useAuthStore.getState().deactivateCloud();

      const state = useAuthStore.getState();
      expect(state.session).toBeNull();
      expect(state.organizationId).toBeNull();
      expect(state.isCloud).toBe(false);
    });
  });

  // ── onAuthStateChange 리스너 ──

  describe('onAuthStateChange', () => {
    it('모듈 로드 시 리스너 등록됨', () => {
      expect(authStateCallback).toBeTypeOf('function');
    });

    it('session null → session만 초기화 (organizationId/plan/isCloud 유지)', () => {
      useAuthStore.setState({
        session: fakeSession,
        organizationId: 'org-abc',
        plan: 'basic',
        isCloud: true,
      });

      authStateCallback!('SIGNED_OUT', null);

      const state = useAuthStore.getState();
      expect(state.session).toBeNull();
      // organizationId/plan/isCloud는 deactivateCloud()에서만 초기화
      expect(state.organizationId).toBe('org-abc');
      expect(state.plan).toBe('basic');
      expect(state.isCloud).toBe(true);
    });

    it('session 있음 → session만 업데이트', () => {
      useAuthStore.setState({
        organizationId: 'org-abc',
        plan: 'basic',
        isCloud: true,
      });

      const newSession = { user: { id: 'user-456' }, access_token: 'new-token' } as any;
      authStateCallback!('TOKEN_REFRESHED', newSession);

      const state = useAuthStore.getState();
      expect(state.session).toBe(newSession);
      expect(state.organizationId).toBe('org-abc');
      expect(state.plan).toBe('basic');
      expect(state.isCloud).toBe(true);
    });
  });

  // ── signInWithOAuth ──

  describe('signInWithOAuth', () => {
    const mockSignInWithOAuth = vi.fn();

    beforeEach(() => {
      // Patch supabase.auth.signInWithOAuth via the mock
      // The mock setup uses mockGetSession etc. but signInWithOAuth is on supabase.auth
      // We access it through the import
    });

    it('google provider → supabase.auth.signInWithOAuth 호출', async () => {
      // signInWithOAuth is called through supabase.auth, which is mocked
      // We need to mock import.meta.env
      const { supabase } = await import('../../config/supabase');
      (supabase as any).auth.signInWithOAuth = vi.fn().mockResolvedValue({
        data: { url: 'https://accounts.google.com/o/oauth2/auth?...' },
        error: null,
      });

      await useAuthStore.getState().signInWithOAuth('google');

      expect((supabase as any).auth.signInWithOAuth).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'google' }),
      );
    });

    it('signInWithOAuth 에러 → throw + loading: false', async () => {
      const { supabase } = await import('../../config/supabase');
      const authError = new Error('OAuth failed');
      (supabase as any).auth.signInWithOAuth = vi.fn().mockResolvedValue({
        data: null,
        error: authError,
      });

      await expect(
        useAuthStore.getState().signInWithOAuth('google'),
      ).rejects.toThrow('OAuth failed');

      expect(useAuthStore.getState().loading).toBe(false);
    });
  });

  // ── handleOAuthCallback ──

  describe('handleOAuthCallback', () => {
    it('유효한 callback → setSession 호출', async () => {
      const { supabase } = await import('../../config/supabase');
      (supabase as any).auth.setSession = vi.fn().mockResolvedValue({
        data: { session: fakeSession },
        error: null,
      });

      await useAuthStore.getState().handleOAuthCallback(
        '#access_token=test-access&refresh_token=test-refresh',
      );

      expect((supabase as any).auth.setSession).toHaveBeenCalledWith({
        access_token: 'test-access',
        refresh_token: 'test-refresh',
      });
    });

    it('__cancelled__ → loading: false, setSession 미호출', async () => {
      const { supabase } = await import('../../config/supabase');
      (supabase as any).auth.setSession = vi.fn();

      useAuthStore.setState({ loading: true });
      await useAuthStore.getState().handleOAuthCallback('__cancelled__');

      expect(useAuthStore.getState().loading).toBe(false);
      expect((supabase as any).auth.setSession).not.toHaveBeenCalled();
    });

    it('토큰 누락 → throw + loading: false', async () => {
      await expect(
        useAuthStore.getState().handleOAuthCallback('#access_token=only-access'),
      ).rejects.toThrow('Missing tokens');

      expect(useAuthStore.getState().loading).toBe(false);
    });

    it('error_description 포함 → 해당 메시지로 throw', async () => {
      await expect(
        useAuthStore.getState().handleOAuthCallback('#error=access_denied&error_description=User+cancelled'),
      ).rejects.toThrow('User cancelled');
    });
  });

  // ── startTrial ──

  describe('startTrial', () => {
    it('성공 → session + org + trial plan 설정', async () => {
      mockGetSession.mockResolvedValue({ data: { session: fakeSession } });
      mockFunctionsInvoke.mockResolvedValue({
        data: { organization_id: 'trial-org-1', plan: 'trial' },
        error: null,
      });

      await useAuthStore.getState().startTrial();

      const state = useAuthStore.getState();
      expect(state.session).toBe(fakeSession);
      expect(state.organizationId).toBe('trial-org-1');
      expect(state.plan).toBe('trial');
      expect(state.isCloud).toBe(true);
      expect(state.loading).toBe(false);
      expect(state.needsSetup).toBe(false);
    });

    it('세션 없으면 loading: false, 상태 변경 없음', async () => {
      mockGetSession.mockResolvedValue({ data: { session: null } });

      await useAuthStore.getState().startTrial();

      const state = useAuthStore.getState();
      expect(state.loading).toBe(false);
      expect(state.organizationId).toBeNull();
    });

    it('edge function 에러 → loading: false, 상태 변경 없음', async () => {
      mockGetSession.mockResolvedValue({ data: { session: fakeSession } });
      mockFunctionsInvoke.mockResolvedValue({
        data: null,
        error: new Error('edge function error'),
      });

      await useAuthStore.getState().startTrial();

      const state = useAuthStore.getState();
      expect(state.loading).toBe(false);
      expect(state.organizationId).toBeNull();
    });

    it('data.error 포함 → loading: false', async () => {
      mockGetSession.mockResolvedValue({ data: { session: fakeSession } });
      mockFunctionsInvoke.mockResolvedValue({
        data: { error: 'some_error' },
        error: null,
      });

      await useAuthStore.getState().startTrial();

      expect(useAuthStore.getState().loading).toBe(false);
      expect(useAuthStore.getState().organizationId).toBeNull();
    });

    it('예외 발생 → loading: false', async () => {
      mockGetSession.mockRejectedValue(new Error('unexpected'));

      await useAuthStore.getState().startTrial();

      expect(useAuthStore.getState().loading).toBe(false);
    });

    it('plan 미반환 시 trial 기본값', async () => {
      mockGetSession.mockResolvedValue({ data: { session: fakeSession } });
      mockFunctionsInvoke.mockResolvedValue({
        data: { organization_id: 'trial-org-2', plan: null },
        error: null,
      });

      await useAuthStore.getState().startTrial();

      expect(useAuthStore.getState().plan).toBe('trial');
    });

    it('getDeviceId 실패 → loading: false', async () => {
      mockGetSession.mockResolvedValue({ data: { session: fakeSession } });

      // crypto.subtle.digest를 throw하도록 모킹
      const originalDigest = crypto.subtle.digest;
      crypto.subtle.digest = vi.fn().mockRejectedValue(new Error('digest failed'));

      await useAuthStore.getState().startTrial();

      expect(useAuthStore.getState().loading).toBe(false);

      crypto.subtle.digest = originalDigest;
    });
  });

  // ── 헬퍼 함수 ──

  describe('helper functions', () => {
    it('isCloud() → store isCloud 값 반환', () => {
      useAuthStore.setState({ isCloud: true });
      expect(isCloud()).toBe(true);
      useAuthStore.setState({ isCloud: false });
      expect(isCloud()).toBe(false);
    });

    it('getOrgId() → store organizationId 반환', () => {
      useAuthStore.setState({ organizationId: 'org-xyz' });
      expect(getOrgId()).toBe('org-xyz');
    });

    it('getPlan() → store plan 반환', () => {
      useAuthStore.setState({ plan: 'basic' });
      expect(getPlan()).toBe('basic');
    });
  });

  // ── migrateOrgData ──

  describe('migrateOrgData', () => {
    it('성공 시 true 반환', async () => {
      mockRpc.mockResolvedValue({ error: null });
      const result = await migrateOrgData('old-org', 'new-org');
      expect(result).toBe(true);
      expect(mockRpc).toHaveBeenCalledWith('migrate_org_data', {
        old_org_id: 'old-org',
        new_org_id: 'new-org',
      });
    });

    it('실패 시 false 반환', async () => {
      mockRpc.mockResolvedValue({ error: new Error('rpc fail') });
      const result = await migrateOrgData('old-org', 'new-org');
      expect(result).toBe(false);
    });
  });

  // ── getAuthProvider / getAuthProviderLabel / getAuthProviderColor ──

  describe('getAuthProvider', () => {
    it('user_metadata.auth_provider 반환', () => {
      useAuthStore.setState({
        session: {
          user: { user_metadata: { auth_provider: 'google' }, app_metadata: {} },
        } as any,
      });
      expect(getAuthProvider()).toBe('google');
    });

    it('user_metadata 없으면 app_metadata.provider 반환', () => {
      useAuthStore.setState({
        session: {
          user: { user_metadata: {}, app_metadata: { provider: 'naver' } },
        } as any,
      });
      expect(getAuthProvider()).toBe('naver');
    });

    it('session 없으면 - 반환', () => {
      useAuthStore.setState({ session: null });
      expect(getAuthProvider()).toBe('-');
    });
  });

  describe('getAuthProviderLabel', () => {
    it('google → Google', () => {
      useAuthStore.setState({
        session: {
          user: { user_metadata: { auth_provider: 'google' }, app_metadata: {} },
        } as any,
      });
      expect(getAuthProviderLabel()).toBe('Google');
    });

    it('알 수 없는 provider → provider 문자열 그대로', () => {
      useAuthStore.setState({
        session: {
          user: { user_metadata: { auth_provider: 'unknown_provider' }, app_metadata: {} },
        } as any,
      });
      expect(getAuthProviderLabel()).toBe('unknown_provider');
    });
  });

  describe('getAuthProviderColor', () => {
    it('google → blue', () => {
      useAuthStore.setState({
        session: {
          user: { user_metadata: { auth_provider: 'google' }, app_metadata: {} },
        } as any,
      });
      expect(getAuthProviderColor()).toBe('blue');
    });

    it('알 수 없는 provider → default', () => {
      useAuthStore.setState({
        session: {
          user: { user_metadata: { auth_provider: 'unknown' }, app_metadata: {} },
        } as any,
      });
      expect(getAuthProviderColor()).toBe('default');
    });
  });

  // ── signInWithOAuth — naver branch ──

  describe('signInWithOAuth — naver', () => {
    it('naver provider → Naver OAuth URL 생성 (Electron 아님)', async () => {
      // VITE_NAVER_CLIENT_ID가 설정된 환경에서
      const originalEnv = import.meta.env.VITE_NAVER_CLIENT_ID;
      import.meta.env.VITE_NAVER_CLIENT_ID = 'test-naver-client-id';
      import.meta.env.VITE_SUPABASE_URL = 'http://127.0.0.1:54321';

      await useAuthStore.getState().signInWithOAuth('naver');

      // loading이 true로 설정됨
      expect(useAuthStore.getState().loading).toBe(true);

      import.meta.env.VITE_NAVER_CLIENT_ID = originalEnv;
    });

    it('naver provider — VITE_NAVER_CLIENT_ID 미설정 → throw', async () => {
      const originalEnv = import.meta.env.VITE_NAVER_CLIENT_ID;
      import.meta.env.VITE_NAVER_CLIENT_ID = '';

      await expect(
        useAuthStore.getState().signInWithOAuth('naver'),
      ).rejects.toThrow('VITE_NAVER_CLIENT_ID not configured');

      expect(useAuthStore.getState().loading).toBe(false);

      import.meta.env.VITE_NAVER_CLIENT_ID = originalEnv;
    });
  });

  // ── onAuthStateChange — SIGNED_IN with session triggers initialize ──

  describe('onAuthStateChange — SIGNED_IN', () => {
    it('SIGNED_IN + session + not initialized → initialize 호출', async () => {
      // _initialized가 false 상태이므로 SIGNED_IN 시 initialize 호출됨
      mockGetSession.mockResolvedValue({ data: { session: fakeSession } });
      mockFromHandlers['user_organizations'] = createQueryBuilder({ organization_id: 'org-cb' });
      mockFromHandlers['organizations'] = createQueryBuilder({ plan: 'basic' });

      authStateCallback!('SIGNED_IN', fakeSession);

      // initialize가 비동기로 실행되므로 잠시 대기
      await new Promise(r => setTimeout(r, 50));

      const state = useAuthStore.getState();
      expect(state.session).toBe(fakeSession);
    });
  });

  // ── initialize — org 없음 + 저장된 키로 자동 복구 ──

  describe('initialize — no org + stored license auto-reactivation', () => {
    it('org 없음 + 유효 키 → activateCloud 호출 + success → return', async () => {
      mockGetSession.mockResolvedValue({ data: { session: fakeSession } });
      mockFromHandlers['user_organizations'] = createQueryBuilder(null);

      localStorage.setItem('app-license', JSON.stringify({ licenseKey: 'TMKH-AUTO-1234-WXYZ' }));

      mockFunctionsInvoke.mockResolvedValue({
        data: { organization_id: 'auto-org', is_new_org: false, plan: 'basic' },
        error: null,
      });

      await useAuthStore.getState().initialize();

      expect(mockFunctionsInvoke).toHaveBeenCalledWith('activate-license', expect.any(Object));
      expect(useAuthStore.getState().organizationId).toBe('auto-org');
    });

    it('org 없음 + 유효 키 + invalid_key → 키 제거 + needsSetup', async () => {
      mockGetSession.mockResolvedValue({ data: { session: fakeSession } });
      mockFromHandlers['user_organizations'] = createQueryBuilder(null);

      localStorage.setItem('app-license', JSON.stringify({ licenseKey: 'TMKH-BAD1-1234-WXYZ' }));

      mockFunctionsInvoke.mockResolvedValue({
        data: { error: 'invalid_key' },
        error: null,
      });

      await useAuthStore.getState().initialize();

      expect(localStorage.getItem('app-license')).toBeNull();
      expect(useAuthStore.getState().needsSetup).toBe(true);
    });

    it('org 없음 + 잘못된 형식 키 → activateCloud 미호출, needsSetup', async () => {
      mockGetSession.mockResolvedValue({ data: { session: fakeSession } });
      mockFromHandlers['user_organizations'] = createQueryBuilder(null);

      localStorage.setItem('app-license', JSON.stringify({ licenseKey: 'BADFORMAT' }));

      await useAuthStore.getState().initialize();

      expect(mockFunctionsInvoke).not.toHaveBeenCalled();
      expect(useAuthStore.getState().needsSetup).toBe(true);
    });

    it('org 없음 + 깨진 JSON → needsSetup', async () => {
      mockGetSession.mockResolvedValue({ data: { session: fakeSession } });
      mockFromHandlers['user_organizations'] = createQueryBuilder(null);

      localStorage.setItem('app-license', '{broken');

      await useAuthStore.getState().initialize();

      expect(useAuthStore.getState().needsSetup).toBe(true);
    });

    it('org 없음 + activateCloud error → needsSetup', async () => {
      mockGetSession.mockResolvedValue({ data: { session: fakeSession } });
      mockFromHandlers['user_organizations'] = createQueryBuilder(null);

      localStorage.setItem('app-license', JSON.stringify({ licenseKey: 'TMKH-ERR1-1234-WXYZ' }));

      mockFunctionsInvoke.mockResolvedValue({
        data: { error: 'some_error' },
        error: null,
      });

      await useAuthStore.getState().initialize();

      expect(useAuthStore.getState().needsSetup).toBe(true);
    });
  });

  // ── activateCloud — getDeviceId failure ──

  describe('activateCloud — getDeviceId failure', () => {
    it('getDeviceId 실패 → error 반환', async () => {
      mockGetSession.mockResolvedValue({ data: { session: fakeSession } });

      const originalDigest = crypto.subtle.digest;
      crypto.subtle.digest = vi.fn().mockRejectedValue(new Error('digest fail'));

      const result = await useAuthStore.getState().activateCloud('TMKH-TEST-1234-ABCD');

      expect(result).toEqual({ status: 'error' });

      crypto.subtle.digest = originalDigest;
    });
  });

  // ── activateCloud — plan fallback ──

  describe('activateCloud — plan fallback', () => {
    it('data.plan 없으면 basic 기본값', async () => {
      mockGetSession.mockResolvedValue({ data: { session: fakeSession } });
      mockFunctionsInvoke.mockResolvedValue({
        data: { organization_id: 'org-fb', is_new_org: true, plan: null },
        error: null,
      });

      const result = await useAuthStore.getState().activateCloud('TMKH-TEST-1234-ABCD');

      expect(result).toEqual({
        status: 'success',
        isNewOrg: true,
        orgChanged: false,
        previousOrgId: null,
      });
      expect(useAuthStore.getState().plan).toBe('basic');
    });
  });

  // ── handleOAuthCallback — error only (no error_description) ──

  describe('handleOAuthCallback — error only', () => {
    it('error만 있고 error_description 없으면 error 값으로 throw', async () => {
      await expect(
        useAuthStore.getState().handleOAuthCallback('#error=server_error'),
      ).rejects.toThrow('server_error');
    });
  });
});
