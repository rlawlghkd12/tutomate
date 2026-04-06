import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';

import { PlanTypeEnum } from '../config/planLimits';
import type { PlanType } from '../config/planLimits';
import { supabase } from '../config/supabase';
import { logInfo, logError, logWarn } from '../utils/logger';
import { isElectron } from '../utils/tauri';
import type { OAuthProvider } from '../lib/oauth';
import { OAUTH_PROVIDERS } from '../lib/oauth';

let _initializing = false;
let _initialized = false;

/** @internal 테스트 전용 리셋 */
export function _resetAuthFlags() {
  _initializing = false;
  _initialized = false;
}

interface AuthStore {
  session: Session | null;
  organizationId: string | null;
  role: 'owner' | 'member' | null;
  plan: PlanType | null;
  isCloud: boolean;
  loading: boolean;
  initialize: () => Promise<void>;
  joinOrganization: (code: string) => Promise<void>;
  switchOrganization: (orgId: string) => Promise<void>;
  signOut: () => Promise<void>;
  signInWithOAuth: (provider: OAuthProvider) => Promise<void>;
  handleOAuthCallback: (callbackUrl: string) => Promise<void>;
}

export const useAuthStore = create<AuthStore>((set) => ({
  session: null,
  organizationId: null,
  role: null,
  plan: null,
  isCloud: false,
  loading: true,

  initialize: async () => {
    if (_initializing || _initialized) return;
    _initializing = true;
    set({ loading: true });

    if (!supabase) {
      logWarn('Supabase not configured, running in local-only mode');
      set({ loading: false });
      _initializing = false;
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session || session.user.is_anonymous) {
        // 세션 없거나 anonymous → 로그인 화면 표시
        if (session?.user.is_anonymous) {
          await supabase.auth.signOut();
        }
        set({ session: null, loading: false });
        logInfo('No OAuth session, showing login screen');
        return;
      }

      // 기존 조직 연결 확인 (활성 조직만)
      const { data: orgLink, error: orgLinkError } = await supabase
        .from('user_organizations')
        .select('organization_id, role')
        .eq('user_id', session.user.id)
        .eq('is_active', true)
        .single();

      if (orgLinkError && orgLinkError.code !== 'PGRST116') {
        logError('Failed to query user_organizations', { error: orgLinkError });
        set({ loading: false });
        return;
      }

      if (orgLink) {
        const { data: orgData } = await supabase
          .from('organizations')
          .select('plan')
          .eq('id', orgLink.organization_id)
          .single();

        set({
          session,
          organizationId: orgLink.organization_id,
          role: (orgLink.role as 'owner' | 'member') || 'member',
          plan: (orgData?.plan as PlanType) || PlanTypeEnum.TRIAL,
          isCloud: true,
          loading: false,
        });
        _initialized = true;
        logInfo('Cloud session restored', { data: { orgId: orgLink.organization_id, plan: orgData?.plan } });
      } else {
        // 로그인됐지만 org 없음 → 자동으로 조직 생성
        logInfo('No active org found, auto-creating org');
        try {
          const { data: autoData, error: autoError } = await supabase.functions.invoke('auto-create-org');

          if (autoError || autoData?.error) {
            logError('Auto-create org failed', { error: autoError, data: autoData });
            set({ session, loading: false });
            return;
          }

          const organizationId = autoData.organization_id as string;
          const plan = (autoData.plan as PlanType) || PlanTypeEnum.TRIAL;

          set({
            session,
            organizationId,
            role: 'owner',
            plan,
            isCloud: true,
            loading: false,
          });
          _initialized = true;
          logInfo('Auto-created org', { data: { orgId: organizationId, plan } });
        } catch (error) {
          logError('Auto-create org error', { error });
          set({ session, loading: false });
        }
      }
    } catch (error) {
      logError('Failed to initialize auth', { error });
      set({ loading: false });
    } finally {
      _initializing = false;
    }
  },

  joinOrganization: async (code: string) => {
    if (!supabase) return;
    set({ loading: true });

    try {
      const { data, error } = await supabase.functions.invoke('join-organization', {
        body: { code },
      });

      if (error || data?.error) {
        logError('Join organization failed', { error, data });
        set({ loading: false });
        throw new Error(data?.error || error?.message || 'Failed to join organization');
      }

      const organizationId = data.organization_id as string;
      const role = (data.role as 'owner' | 'member') || 'member';
      const plan = (data.plan as PlanType) || PlanTypeEnum.TRIAL;

      set({
        organizationId,
        role,
        plan,
        isCloud: true,
        loading: false,
      });
      _initialized = true;
      logInfo('Joined organization', { data: { orgId: organizationId, role, plan } });
    } catch (error) {
      set({ loading: false });
      throw error;
    }
  },

  switchOrganization: async (orgId: string) => {
    if (!supabase) return;
    set({ loading: true });

    try {
      const { data, error } = await supabase.functions.invoke('switch-organization', {
        body: { organization_id: orgId },
      });

      if (error || data?.error) {
        logError('Switch organization failed', { error, data });
        set({ loading: false });
        throw new Error(data?.error || error?.message || 'Failed to switch organization');
      }

      const organizationId = data.organization_id as string;
      const role = (data.role as 'owner' | 'member') || 'member';
      const plan = (data.plan as PlanType) || PlanTypeEnum.TRIAL;

      set({
        organizationId,
        role,
        plan,
        isCloud: true,
        loading: false,
      });
      logInfo('Switched organization', { data: { orgId: organizationId, role, plan } });
    } catch (error) {
      set({ loading: false });
      throw error;
    }
  },

  signOut: async () => {
    if (!supabase) return;

    try {
      await supabase.auth.signOut();
    } catch (error) {
      logError('Sign out error', { error });
    }

    set({
      session: null,
      organizationId: null,
      role: null,
      plan: null,
      isCloud: false,
    });

    _initialized = false;
    logInfo('Signed out');
  },

  signInWithOAuth: async (provider: OAuthProvider) => {
    if (!supabase) return;
    set({ loading: true });

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
    const redirectTo = `${supabaseUrl}/functions/v1/auth-redirect`;

    if (provider === 'naver') {
      // Naver는 Supabase 네이티브 미지원 → Edge Function 경유
      const naverClientId = import.meta.env.VITE_NAVER_CLIENT_ID as string;
      if (!naverClientId) { set({ loading: false }); throw new Error('VITE_NAVER_CLIENT_ID not configured'); }
      const state = crypto.randomUUID();
      const callbackUrl = `${supabaseUrl}/functions/v1/naver-auth`;
      const naverUrl = `https://nid.naver.com/oauth2.0/authorize?client_id=${naverClientId}&redirect_uri=${encodeURIComponent(callbackUrl)}&response_type=code&state=${state}`;
      logInfo('Naver OAuth URL generated', { data: { url: naverUrl } });
      if (isElectron()) {
        await window.electronAPI.openOAuthUrl(naverUrl);
      }
    } else {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (error) { set({ loading: false }); throw error; }
      logInfo('OAuth URL generated', { data: { url: data.url, redirectTo } });
      if (data.url && isElectron()) {
        await window.electronAPI.openOAuthUrl(data.url);
      }
    }
  },

  handleOAuthCallback: async (callbackData: string) => {
    if (!supabase) return;
    if (callbackData === '__cancelled__') {
      set({ loading: false });
      return;
    }
    // hash fragment에서 토큰 추출: #access_token=...&refresh_token=...
    const params = new URLSearchParams(callbackData.replace(/^#/, ''));
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    if (!accessToken || !refreshToken) {
      set({ loading: false });
      throw new Error(params.get('error_description') || params.get('error') || 'Missing tokens');
    }
    await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    // → onAuthStateChange(SIGNED_IN) → initialize() 자동 호출
  },
}));

// 세션 변경 리스너
if (supabase) {
  supabase.auth.onAuthStateChange((event, session) => {
    useAuthStore.setState({ session });
    if (event === 'SIGNED_IN' && session && !_initialized) {
      useAuthStore.getState().initialize();
    }
  });
}

// 스토어 외부에서 사용하는 헬퍼
export const isCloud = (): boolean => useAuthStore.getState().isCloud;
export const getOrgId = (): string | null => useAuthStore.getState().organizationId;
export const getPlan = (): PlanType | null => useAuthStore.getState().plan;
export const isOwner = (): boolean => useAuthStore.getState().role === 'owner';

export function getAuthProvider(): string {
  const user = useAuthStore.getState().session?.user;
  return user?.user_metadata?.auth_provider || user?.app_metadata?.provider || '-';
}

export function getAuthProviderLabel(): string {
  const p = getAuthProvider() as OAuthProvider;
  return OAUTH_PROVIDERS[p]?.label?.replace(/로 로그인$/, '') || p;
}

export function getAuthProviderColor(): string {
  const p = getAuthProvider() as OAuthProvider;
  return OAUTH_PROVIDERS[p]?.tagColor || 'default';
}
