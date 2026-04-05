import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';

import type { PlanType } from '../config/planLimits';
import { supabase } from '../config/supabase';
import { appConfig } from '../config/appConfig';
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

async function getDeviceId(): Promise<string> {
  let machineId: string;

  if (isElectron()) {
    machineId = await window.electronAPI.getMachineId();
  } else {
    const stored = localStorage.getItem(appConfig.deviceIdKey);
    if (stored) {
      machineId = stored;
    } else {
      machineId = crypto.randomUUID();
      localStorage.setItem(appConfig.deviceIdKey, machineId);
    }
  }

  machineId = machineId.toUpperCase();
  const raw = `${appConfig.deviceIdKey}:${machineId}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(raw);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

interface AuthStore {
  session: Session | null;
  organizationId: string | null;
  plan: PlanType | null;
  isCloud: boolean;
  loading: boolean;
  needsSetup: boolean; // 로그인됐지만 org 없음 → 라이선스/체험판 화면
  initialize: () => Promise<void>;
  activateCloud: (licenseKey: string) => Promise<
    | { status: 'success'; isNewOrg: boolean; orgChanged: boolean; previousOrgId: string | null }
    | { status: 'invalid_key' | 'max_seats_reached' | 'error' }
  >;
  startTrial: () => Promise<void>;
  deactivateCloud: () => Promise<void>;
  signInWithOAuth: (provider: OAuthProvider) => Promise<void>;
  handleOAuthCallback: (callbackUrl: string) => Promise<void>;
}

export const useAuthStore = create<AuthStore>((set) => ({
  session: null,
  organizationId: null,
  plan: null,
  isCloud: false,
  loading: true,
  needsSetup: false,

  initialize: async () => {
    if (_initializing || _initialized) return;
    _initializing = true;
    set({ loading: true, needsSetup: false });

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

      // 기존 조직 연결 확인
      const { data: orgLink, error: orgLinkError } = await supabase
        .from('user_organizations')
        .select('organization_id')
        .eq('user_id', session.user.id)
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
          plan: (orgData?.plan as PlanType) || 'trial',
          isCloud: true,
          loading: false,
        });
        _initialized = true;
        logInfo('Cloud session restored', { data: { orgId: orgLink.organization_id, plan: orgData?.plan } });
      } else {
        // 로그인됐지만 org 없음 → 저장된 라이선스 키로 자동 복구 시도
        const stored = localStorage.getItem('app-license');
        if (stored) {
          try {
            const { licenseKey } = JSON.parse(stored) as { licenseKey: string };
            if (licenseKey && /^TMK[HA]-/.test(licenseKey)) {
              logInfo('Auto-reactivating stored license for logged-in user');
              const result = await useAuthStore.getState().activateCloud(licenseKey);
              if (result.status === 'success') {
                logInfo('Auto-reactivation succeeded');
                return; // activateCloud에서 state 설정 완료
              }
              if (result.status === 'invalid_key') {
                logWarn('Stored license key is invalid, removing');
                localStorage.removeItem('app-license');
              }
            }
          } catch {
            // 자동 재활성화 실패 → setup 화면으로 진행
          }
        }
        set({ session, loading: false, needsSetup: true });
        logInfo('Logged in but no org, showing setup screen');
      }

      // 자동 재활성화: trial 상태인데 저장된 라이센스 키가 있으면 복구
      const currentState = useAuthStore.getState();
      if (currentState.plan === 'trial') {
        try {
          const stored = localStorage.getItem('app-license');
          if (stored) {
            const { licenseKey } = JSON.parse(stored) as { licenseKey: string };
            if (licenseKey && /^TMK[HA]-/.test(licenseKey)) {
              logInfo('Auto-reactivating stored license');
              const result = await useAuthStore.getState().activateCloud(licenseKey);
              if (result.status === 'invalid_key') {
                logWarn('Stored license key is invalid, removing');
                localStorage.removeItem('app-license');
              }
            }
          }
        } catch {
          // 자동 재활성화 실패 → trial 유지
        }
      }
    } catch (error) {
      logError('Failed to initialize auth', { error });
      set({ loading: false });
    } finally {
      _initializing = false;
    }
  },

  activateCloud: async (licenseKey: string): Promise<
    | { status: 'success'; isNewOrg: boolean; orgChanged: boolean; previousOrgId: string | null }
    | { status: 'invalid_key' | 'max_seats_reached' | 'error' }
  > => {
    if (!supabase) {
      logError('Supabase client not initialized', {});
      return { status: 'error' };
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        logError('No session for license activation');
        return { status: 'error' };
      }

      let deviceId: string;
      try {
        deviceId = await getDeviceId();
        logInfo('Device ID retrieved', { data: { deviceId: deviceId.slice(0, 8) + '...' } });
      } catch (error) {
        logError('Failed to get device ID, aborting activation', { error });
        return { status: 'error' };
      }

      logInfo('Calling activate-license edge function');
      const { data, error } = await supabase.functions.invoke('activate-license', {
        body: { license_key: licenseKey, device_id: deviceId },
      });

      if (error) {
        logError('License activation failed', { error, data: { message: error.message } });
        return { status: 'error' };
      }

      logInfo('Edge function response', { data });

      if (data?.error === 'max_seats_reached') {
        return { status: 'max_seats_reached' };
      }

      if (data?.error === 'invalid_key' || data?.error === 'invalid_format') {
        return { status: 'invalid_key' };
      }

      if (data?.error) {
        logError('License activation returned error', { data: { error: data.error } });
        return { status: 'error' };
      }

      const organizationId = data.organization_id as string;
      const isNewOrg = data.is_new_org as boolean;
      const plan = (data.plan as PlanType) || 'basic';

      const previousOrgId: string | null = useAuthStore.getState().organizationId;
      const orgChanged: boolean = previousOrgId !== null && previousOrgId !== organizationId;

      set({
        session,
        organizationId,
        plan,
        isCloud: true,
        needsSetup: false,
      });

      _initialized = true;
      logInfo('License activated, cloud upgraded', { data: { orgId: organizationId, isNewOrg, plan, orgChanged } });
      return { status: 'success', isNewOrg, orgChanged, previousOrgId };
    } catch (error) {
      logError('activateCloud error', { error });
      return { status: 'error' };
    }
  },

  startTrial: async () => {
    if (!supabase) return;
    set({ loading: true });

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        set({ loading: false });
        return;
      }

      let deviceId: string;
      try {
        deviceId = await getDeviceId();
      } catch (error) {
        logError('Failed to get device ID', { error });
        set({ loading: false });
        return;
      }

      const { data: trialData, error: trialError } = await supabase.functions.invoke(
        'create-trial-org',
        { body: { device_id: deviceId } },
      );

      if (trialError || trialData?.error) {
        logError('Trial org creation failed', { error: trialError, data: trialData });
        set({ loading: false });
        return;
      }

      const organizationId = trialData.organization_id as string;
      const plan = (trialData.plan as PlanType) || 'trial';

      set({
        session,
        organizationId,
        plan,
        isCloud: true,
        loading: false,
        needsSetup: false,
      });
      _initialized = true;
      logInfo('Trial started', { data: { orgId: organizationId } });
    } catch (error) {
      logError('startTrial error', { error });
      set({ loading: false });
    }
  },

  deactivateCloud: async () => {
    if (!supabase) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        await supabase
          .from('user_organizations')
          .delete()
          .eq('user_id', session.user.id);
      }
    } catch (error) {
      logError('Failed to delete user_organizations', { error });
    }

    try {
      await supabase.auth.signOut();
    } catch (error) {
      logError('Sign out error', { error });
    }

    set({
      session: null,
      organizationId: null,
      plan: null,
      isCloud: false,
      needsSetup: false,
    });

    _initialized = false;
    logInfo('Cloud deactivated');
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

/**
 * 체험판 → 라이선스 전환 시 기존 데이터의 organization_id 일괄 변경
 */
export async function migrateOrgData(oldOrgId: string, newOrgId: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.rpc('migrate_org_data', {
    old_org_id: oldOrgId,
    new_org_id: newOrgId,
  });
  if (error) {
    logError('Failed to migrate org data', { error });
    return false;
  }
  logInfo('Org data migrated', { data: { from: oldOrgId, to: newOrgId } });
  return true;
}
