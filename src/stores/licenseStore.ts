import { create } from 'zustand';

import type { LicenseInfo } from '../types';
import { PLAN_LIMITS } from '../config/planLimits';
import type { PlanType, PlanLimitKey } from '../config/planLimits';
import { useAuthStore } from './authStore';
import { logError } from '../utils/logger';

export type ActivateResult =
  | { result: 'success'; isNewOrg: boolean }
  | { result: 'invalid_format' | 'invalid_key' | 'network_error' | 'max_seats_reached' };

interface LicenseStore {
  licenseKey: string;
  activatedAt: string;
  loadLicense: () => void;
  activateLicense: (key: string) => Promise<ActivateResult>;
  deactivateLicense: () => Promise<void>;
  getPlan: () => PlanType;
  getLimit: (key: PlanLimitKey) => number;
}

const LICENSE_KEY = 'app-license';

/**
 * 키 형식 검증: TMKH-XXXX-XXXX-XXXX (영숫자 대문자)
 */
function isValidKeyFormat(key: string): boolean {
  return /^TMK[HA]-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(key);
}

export const useLicenseStore = create<LicenseStore>((set, get) => ({
  licenseKey: '',
  activatedAt: '',

  loadLicense: () => {
    try {
      const stored = localStorage.getItem(LICENSE_KEY);
      if (stored) {
        const info = JSON.parse(stored) as LicenseInfo;
        set({ licenseKey: info.licenseKey, activatedAt: info.activatedAt });
      }
    } catch (error) {
      logError('Failed to load license', { error });
    }
  },

  activateLicense: async (key: string): Promise<ActivateResult> => {
    const normalized = key.trim().toUpperCase();

    if (!isValidKeyFormat(normalized)) {
      return { result: 'invalid_format' };
    }

    try {
      // Edge Function에서 키 검증 + 조직 연결을 모두 처리
      const cloudResult = await useAuthStore.getState().activateCloud(normalized);

      if (cloudResult.status === 'max_seats_reached') {
        return { result: 'max_seats_reached' };
      }

      if (cloudResult.status === 'invalid_key') {
        return { result: 'invalid_key' };
      }

      if (cloudResult.status === 'error') {
        return { result: 'network_error' };
      }

      const info: LicenseInfo = {
        licenseKey: normalized,
        activatedAt: new Date().toISOString(),
      };

      localStorage.setItem(LICENSE_KEY, JSON.stringify(info));
      set({ licenseKey: info.licenseKey, activatedAt: info.activatedAt });

      const isNewOrg = cloudResult.status === 'success' ? cloudResult.isNewOrg : false;
      return { result: 'success', isNewOrg };
    } catch {
      return { result: 'network_error' };
    }
  },

  deactivateLicense: async () => {
    // Supabase 로그아웃
    await useAuthStore.getState().deactivateCloud();

    localStorage.removeItem(LICENSE_KEY);
    set({ licenseKey: '', activatedAt: '' });
  },

  getPlan: (): PlanType => {
    const authState = useAuthStore.getState();
    if (authState.isCloud) {
      return authState.plan || 'basic';
    }
    const { licenseKey } = get();
    if (licenseKey && isValidKeyFormat(licenseKey)) {
      return 'basic';
    }
    return 'trial';
  },

  getLimit: (key: PlanLimitKey): number => {
    const plan = get().getPlan();
    return PLAN_LIMITS[plan][key];
  },
}));
