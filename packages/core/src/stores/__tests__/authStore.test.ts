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

import { useAuthStore, isCloud, getOrgId, getPlan, migrateOrgData, _resetAuthFlags } from '../authStore';

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

      const orgLinkBuilder = createQueryBuilder({ organization_id: 'org-abc' });
      const orgBuilder = createQueryBuilder({ plan: 'basic' });
      mockFromHandlers['user_organizations'] = orgLinkBuilder;
      mockFromHandlers['organizations'] = orgBuilder;

      await useAuthStore.getState().initialize();

      const state = useAuthStore.getState();
      expect(state.loading).toBe(false);
      expect(state.isCloud).toBe(true);
      expect(state.organizationId).toBe('org-abc');
      expect(state.plan).toBe('basic');
      expect(state.session).toBe(fakeSession);

      // 올바른 쿼리 파라미터로 호출됐는지 검증
      expect(orgLinkBuilder.select).toHaveBeenCalledWith('organization_id');
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
});
