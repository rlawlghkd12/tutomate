// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Mock supabase (vi.hoisted로 hoisting 문제 해결) ──
const {
  mockGetSession,
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

import { useAuthStore, isCloud, getOrgId, getPlan, isOwner, _resetAuthFlags, getAuthProvider, getAuthProviderLabel, getAuthProviderColor } from '../authStore';

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
    });
    Object.keys(mockFromHandlers).forEach((k) => delete mockFromHandlers[k]);
  });

  // ── initialize ──

  describe('initialize', () => {
    it('기존 세션 + 기존 active org → session restored', async () => {
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

      // 올바른 쿼리 파라미터로 호출됐는지 검증 (is_active 포함)
      expect(orgLinkBuilder.select).toHaveBeenCalledWith('organization_id, role');
      expect(orgLinkBuilder.eq).toHaveBeenCalledWith('user_id', 'user-123');
      expect(orgLinkBuilder.eq).toHaveBeenCalledWith('is_active', true);
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

    it('세션 있지만 org 없으면 auto-create-org 호출', async () => {
      mockGetSession.mockResolvedValue({ data: { session: fakeSession } });
      mockFromHandlers['user_organizations'] = createQueryBuilder(null);

      mockFunctionsInvoke.mockResolvedValue({
        data: { organization_id: 'auto-org', plan: 'trial' },
        error: null,
      });

      await useAuthStore.getState().initialize();

      expect(mockFunctionsInvoke).toHaveBeenCalledWith('auto-create-org');
      const state = useAuthStore.getState();
      expect(state.loading).toBe(false);
      expect(state.organizationId).toBe('auto-org');
      expect(state.plan).toBe('trial');
      expect(state.isCloud).toBe(true);
    });

    it('auto-create-org 실패 → loading: false, org 없음', async () => {
      mockGetSession.mockResolvedValue({ data: { session: fakeSession } });
      mockFromHandlers['user_organizations'] = createQueryBuilder(null);

      mockFunctionsInvoke.mockResolvedValue({
        data: null,
        error: new Error('edge function error'),
      });

      await useAuthStore.getState().initialize();

      const state = useAuthStore.getState();
      expect(state.loading).toBe(false);
      expect(state.organizationId).toBeNull();
      expect(state.session).toBe(fakeSession);
    });

    it('auto-create-org data.error → loading: false, org 없음', async () => {
      mockGetSession.mockResolvedValue({ data: { session: fakeSession } });
      mockFromHandlers['user_organizations'] = createQueryBuilder(null);

      mockFunctionsInvoke.mockResolvedValue({
        data: { error: 'some_error' },
        error: null,
      });

      await useAuthStore.getState().initialize();

      const state = useAuthStore.getState();
      expect(state.loading).toBe(false);
      expect(state.organizationId).toBeNull();
    });

    it('auto-create-org 예외 → loading: false', async () => {
      mockGetSession.mockResolvedValue({ data: { session: fakeSession } });
      mockFromHandlers['user_organizations'] = createQueryBuilder(null);

      mockFunctionsInvoke.mockRejectedValue(new Error('unexpected'));

      await useAuthStore.getState().initialize();

      const state = useAuthStore.getState();
      expect(state.loading).toBe(false);
      expect(state.session).toBe(fakeSession);
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

    it('role이 member이면 state에 member 저장', async () => {
      mockGetSession.mockResolvedValue({ data: { session: fakeSession } });

      const orgLinkBuilder = createQueryBuilder({ organization_id: 'org-123', role: 'member' });
      const orgBuilder = createQueryBuilder({ plan: 'basic' });
      mockFromHandlers['user_organizations'] = orgLinkBuilder;
      mockFromHandlers['organizations'] = orgBuilder;

      await useAuthStore.getState().initialize();

      expect(useAuthStore.getState().role).toBe('member');
    });

    it('orgData null → plan fallback to trial', async () => {
      mockGetSession.mockResolvedValue({ data: { session: fakeSession } });
      mockFromHandlers['user_organizations'] = createQueryBuilder({ organization_id: 'org-abc' });
      mockFromHandlers['organizations'] = createQueryBuilder({ plan: null });

      await useAuthStore.getState().initialize();

      const state = useAuthStore.getState();
      expect(state.plan).toBe('trial');
      expect(state.organizationId).toBe('org-abc');
      expect(state.isCloud).toBe(true);
    });

    it('auto-create-org plan 미반환 시 trial 기본값', async () => {
      mockGetSession.mockResolvedValue({ data: { session: fakeSession } });
      mockFromHandlers['user_organizations'] = createQueryBuilder(null);

      mockFunctionsInvoke.mockResolvedValue({
        data: { organization_id: 'auto-org', plan: null },
        error: null,
      });

      await useAuthStore.getState().initialize();

      expect(useAuthStore.getState().plan).toBe('trial');
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

  // ── joinOrganization ──

  describe('joinOrganization', () => {
    it('성공 → org + role + plan 설정', async () => {
      mockFunctionsInvoke.mockResolvedValue({
        data: { organization_id: 'joined-org', role: 'member', plan: 'basic' },
        error: null,
      });

      await useAuthStore.getState().joinOrganization('INVITE-CODE');

      expect(mockFunctionsInvoke).toHaveBeenCalledWith('join-organization', {
        body: { code: 'INVITE-CODE' },
      });
      const state = useAuthStore.getState();
      expect(state.organizationId).toBe('joined-org');
      expect(state.role).toBe('member');
      expect(state.plan).toBe('basic');
      expect(state.isCloud).toBe(true);
      expect(state.loading).toBe(false);
    });

    it('edge function 에러 → throw + loading: false', async () => {
      mockFunctionsInvoke.mockResolvedValue({
        data: null,
        error: new Error('edge function error'),
      });

      await expect(
        useAuthStore.getState().joinOrganization('BAD-CODE'),
      ).rejects.toThrow();

      expect(useAuthStore.getState().loading).toBe(false);
    });

    it('data.error → throw + loading: false', async () => {
      mockFunctionsInvoke.mockResolvedValue({
        data: { error: 'invalid_code' },
        error: null,
      });

      await expect(
        useAuthStore.getState().joinOrganization('BAD-CODE'),
      ).rejects.toThrow('invalid_code');

      expect(useAuthStore.getState().loading).toBe(false);
    });

    it('role 미반환 시 member 기본값', async () => {
      mockFunctionsInvoke.mockResolvedValue({
        data: { organization_id: 'joined-org', plan: 'basic' },
        error: null,
      });

      await useAuthStore.getState().joinOrganization('CODE');

      expect(useAuthStore.getState().role).toBe('member');
    });

    it('plan 미반환 시 trial 기본값', async () => {
      mockFunctionsInvoke.mockResolvedValue({
        data: { organization_id: 'joined-org', role: 'member' },
        error: null,
      });

      await useAuthStore.getState().joinOrganization('CODE');

      expect(useAuthStore.getState().plan).toBe('trial');
    });
  });

  // ── switchOrganization ──

  describe('switchOrganization', () => {
    it('성공 → org + role + plan 변경', async () => {
      useAuthStore.setState({ organizationId: 'old-org', role: 'owner', plan: 'basic', isCloud: true });

      mockFunctionsInvoke.mockResolvedValue({
        data: { organization_id: 'new-org', role: 'member', plan: 'trial' },
        error: null,
      });

      await useAuthStore.getState().switchOrganization('new-org');

      expect(mockFunctionsInvoke).toHaveBeenCalledWith('switch-organization', {
        body: { organization_id: 'new-org' },
      });
      const state = useAuthStore.getState();
      expect(state.organizationId).toBe('new-org');
      expect(state.role).toBe('member');
      expect(state.plan).toBe('trial');
      expect(state.loading).toBe(false);
    });

    it('edge function 에러 → throw + loading: false', async () => {
      mockFunctionsInvoke.mockResolvedValue({
        data: null,
        error: new Error('network error'),
      });

      await expect(
        useAuthStore.getState().switchOrganization('bad-org'),
      ).rejects.toThrow();

      expect(useAuthStore.getState().loading).toBe(false);
    });

    it('data.error → throw + loading: false', async () => {
      mockFunctionsInvoke.mockResolvedValue({
        data: { error: 'not_a_member' },
        error: null,
      });

      await expect(
        useAuthStore.getState().switchOrganization('bad-org'),
      ).rejects.toThrow('not_a_member');

      expect(useAuthStore.getState().loading).toBe(false);
    });
  });

  // ── signOut ──

  describe('signOut', () => {
    it('sign out + state 초기화 (user_organizations 삭제 안 함)', async () => {
      mockSignOut.mockResolvedValue({});

      useAuthStore.setState({
        session: fakeSession,
        organizationId: 'org-abc',
        plan: 'basic',
        isCloud: true,
      });

      await useAuthStore.getState().signOut();

      const state = useAuthStore.getState();
      expect(state.session).toBeNull();
      expect(state.organizationId).toBeNull();
      expect(state.plan).toBeNull();
      expect(state.isCloud).toBe(false);
      expect(mockSignOut).toHaveBeenCalled();
      // user_organizations delete 호출 없음
      expect(mockFromHandlers['user_organizations']).toBeUndefined();
    });

    it('signOut 실패해도 state 초기화 진행', async () => {
      mockSignOut.mockRejectedValue(new Error('signOut fail'));

      useAuthStore.setState({ isCloud: true, organizationId: 'org-abc' });

      await useAuthStore.getState().signOut();

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
      // organizationId/plan/isCloud는 signOut()에서만 초기화
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
    it('google provider → supabase.auth.signInWithOAuth 호출', async () => {
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

    it('error만 있고 error_description 없으면 error 값으로 throw', async () => {
      await expect(
        useAuthStore.getState().handleOAuthCallback('#error=server_error'),
      ).rejects.toThrow('server_error');
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
});
