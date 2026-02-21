import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';

import type { PlanType } from '../config/planLimits';
import { supabase } from '../config/supabase';
import { logInfo, logError } from '../utils/logger';

interface AuthStore {
  session: Session | null;
  organizationId: string | null;
  plan: PlanType | null;
  isCloud: boolean;
  loading: boolean;

  initialize: () => Promise<void>;
  activateCloud: (licenseKey: string) => Promise<{ status: 'success'; isNewOrg: boolean } | { status: 'invalid_key' | 'max_seats_reached' | 'error' }>;
  deactivateCloud: () => Promise<void>;
}

export const useAuthStore = create<AuthStore>((set) => ({
  session: null,
  organizationId: null,
  plan: null,
  isCloud: false,
  loading: true,

  initialize: async () => {
    if (!supabase) {
      set({ loading: false });
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (session) {
        // 세션 있으면 organizationId 조회
        const { data } = await supabase
          .from('user_organizations')
          .select('organization_id')
          .eq('user_id', session.user.id)
          .single();

        if (data) {
          // 조직 plan 조회
          const { data: orgData } = await supabase
            .from('organizations')
            .select('plan')
            .eq('id', data.organization_id)
            .single();

          set({
            session,
            organizationId: data.organization_id,
            plan: (orgData?.plan as PlanType) || 'basic',
            isCloud: true,
            loading: false,
          });
          logInfo('Cloud session restored', { data: { orgId: data.organization_id } });
          return;
        }
      }

      set({ loading: false });
    } catch (error) {
      logError('Failed to initialize auth', { error });
      set({ loading: false });
    }

    // 세션 변경 리스너
    supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        set({ session: null, organizationId: null, plan: null, isCloud: false });
      } else {
        set({ session });
      }
    });
  },

  activateCloud: async (licenseKey: string) => {
    if (!supabase) {
      logError('Supabase client not initialized', {});
      return { status: 'error' };
    }

    try {
      // 1. 익명 로그인
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

      // 2. Edge Function으로 라이센스 검증 + 조직 연결
      logInfo('Calling activate-license edge function');
      const { data, error } = await supabase.functions.invoke('activate-license', {
        body: { license_key: licenseKey },
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

      set({
        session,
        organizationId,
        plan,
        isCloud: true,
      });

      logInfo('Cloud activated', { data: { orgId: organizationId, isNewOrg } });
      return { status: 'success', isNewOrg };
    } catch (error) {
      logError('activateCloud error', { error });
      return { status: 'error' };
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

// 스토어 외부에서 사용하는 헬퍼
export const isCloud = (): boolean => useAuthStore.getState().isCloud;
export const getOrgId = (): string | null => useAuthStore.getState().organizationId;
export const getPlan = (): PlanType | null => useAuthStore.getState().plan;
