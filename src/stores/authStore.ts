import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';

import type { PlanType } from '../config/planLimits';
import { supabase } from '../config/supabase';
import { logInfo, logError, logWarn } from '../utils/logger';
import { isElectron } from '../utils/tauri';

async function getDeviceId(): Promise<string> {
  let machineId: string;

  if (isElectron()) {
    machineId = await window.electronAPI.getMachineId();
  } else {
    const stored = localStorage.getItem('tutomate_device_id');
    if (stored) {
      machineId = stored;
    } else {
      machineId = crypto.randomUUID();
      localStorage.setItem('tutomate_device_id', machineId);
    }
  }

  // Tauri(ioreg)는 대문자, node-machine-id는 소문자 반환 → 대문자로 통일
  machineId = machineId.toUpperCase();

  const encoder = new TextEncoder();
  const data = encoder.encode(machineId);
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
  _previousOrg: { organizationId: string; plan: PlanType | null } | null;

  initialize: () => Promise<void>;
  activateCloud: (licenseKey: string) => Promise<
    | { status: 'success'; isNewOrg: boolean; orgChanged: boolean; previousOrgId: string | null }
    | { status: 'invalid_key' | 'max_seats_reached' | 'error' }
  >;
  rollbackOrg: () => void;
  deactivateCloud: () => Promise<void>;
}

export const useAuthStore = create<AuthStore>((set) => ({
  session: null,
  organizationId: null,
  plan: null,
  isCloud: false,
  loading: true,
  _previousOrg: null,

  initialize: async () => {
    if (!supabase) {
      logWarn('Supabase not configured, running in local-only mode');
      set({ loading: false });
      return;
    }

    try {
      // 1. 기존 세션 확인 또는 익명 로그인
      let { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        const { data, error: signInError } = await supabase.auth.signInAnonymously();
        if (signInError || !data.session) {
          logError('Anonymous sign-in failed', { error: signInError });
          set({ loading: false });
          return;
        }
        session = data.session;
      }

      // 2. 기존 조직 연결 확인
      const { data: orgLink } = await supabase
        .from('user_organizations')
        .select('organization_id')
        .eq('user_id', session.user.id)
        .single();

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
        logInfo('Cloud session restored', { data: { orgId: orgLink.organization_id, plan: orgData?.plan } });
      } else {
        // 3. 조직 없음 → trial org 자동 생성
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
        const isNewOrg = trialData.is_new_org as boolean;

        set({
          session,
          organizationId,
          plan,
          isCloud: true,
          loading: false,
        });
        logInfo('Trial cloud activated', { data: { orgId: organizationId, isNewOrg } });
      }
    } catch (error) {
      logError('Failed to initialize auth', { error });
      set({ loading: false });
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
      // 세션은 이미 initialize()에서 생성되어 있어야 함
      let { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        logInfo('No session, attempting anonymous sign-in');
        const { data, error: signInError } = await supabase.auth.signInAnonymously();
        if (signInError || !data.session) {
          logError('Anonymous sign-in failed', { error: signInError, data: { message: signInError?.message } });
          return { status: 'error' };
        }
        session = data.session;
        logInfo('Anonymous sign-in successful', { data: { userId: session.user.id } });
      }

      // 기기 ID 조회
      let deviceId: string;
      try {
        deviceId = await getDeviceId();
        logInfo('Device ID retrieved', { data: { deviceId: deviceId.slice(0, 8) + '...' } });
      } catch (error) {
        logError('Failed to get device ID, aborting activation', { error });
        return { status: 'error' };
      }

      // Edge Function으로 라이센스 검증 + 조직 연결 (trial → licensed 업그레이드 포함)
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
        _previousOrg: orgChanged && previousOrgId ? { organizationId: previousOrgId, plan: useAuthStore.getState().plan } : null,
      });

      logInfo('License activated, cloud upgraded', { data: { orgId: organizationId, isNewOrg, plan, orgChanged } });
      return { status: 'success', isNewOrg, orgChanged, previousOrgId };
    } catch (error) {
      logError('activateCloud error', { error });
      return { status: 'error' };
    }
  },

  rollbackOrg: () => {
    const prev = useAuthStore.getState()._previousOrg;
    if (prev) {
      set({
        organizationId: prev.organizationId,
        plan: prev.plan,
        _previousOrg: null,
      });
      logInfo('Org rollback to previous trial org', { data: { orgId: prev.organizationId } });
    }
  },

  deactivateCloud: async () => {
    if (!supabase) return;

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
    });

    logInfo('Cloud deactivated');
  },
}));

// 세션 변경 리스너 (모듈 로드 시 1회만 등록)
if (supabase) {
  supabase.auth.onAuthStateChange((_event, session) => {
    if (!session) {
      useAuthStore.setState({ session: null, organizationId: null, plan: null, isCloud: false });
    } else {
      useAuthStore.setState({ session });
    }
  });
}

// 스토어 외부에서 사용하는 헬퍼
export const isCloud = (): boolean => useAuthStore.getState().isCloud;
export const getOrgId = (): string | null => useAuthStore.getState().organizationId;
export const getPlan = (): PlanType | null => useAuthStore.getState().plan;
