// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock supabase as null (no Supabase configured)
vi.mock('../../config/supabase', () => ({
  supabase: null,
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

import { useAuthStore, _resetAuthFlags } from '../authStore';

describe('authStore — supabase null', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetAuthFlags();
    useAuthStore.setState({
      session: null,
      organizationId: null,
      role: null,
      plan: null,
      isCloud: false,
      loading: true,
    });
  });

  it('initialize — supabase null → local-only mode, loading: false', async () => {
    await useAuthStore.getState().initialize();

    const state = useAuthStore.getState();
    expect(state.loading).toBe(false);
    expect(state.isCloud).toBe(false);
    expect(state.session).toBeNull();
  });

  it('joinOrganization — supabase null → 즉시 리턴', async () => {
    await useAuthStore.getState().joinOrganization('CODE');
    // 에러 없이 완료, state 변경 없음
    expect(useAuthStore.getState().loading).toBe(true); // loading 변경 안 됨
  });

  it('switchOrganization — supabase null → 즉시 리턴', async () => {
    await useAuthStore.getState().switchOrganization('org-id');
    expect(useAuthStore.getState().loading).toBe(true);
  });

  it('signOut — supabase null → 즉시 리턴', async () => {
    useAuthStore.setState({ isCloud: true, organizationId: 'org-abc' });
    await useAuthStore.getState().signOut();
    // supabase null이면 if (!supabase) return 으로 즉시 리턴
    // state 변경 없음
    expect(useAuthStore.getState().isCloud).toBe(true);
  });

  it('signInWithOAuth — supabase null → 즉시 리턴', async () => {
    await useAuthStore.getState().signInWithOAuth('google');
    expect(useAuthStore.getState().loading).toBe(true);
  });

  it('handleOAuthCallback — supabase null → 즉시 리턴', async () => {
    await useAuthStore.getState().handleOAuthCallback('#access_token=a&refresh_token=b');
    expect(useAuthStore.getState().loading).toBe(true);
  });
});
