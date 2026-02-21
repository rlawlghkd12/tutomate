import { create } from 'zustand';

import type { LicenseInfo } from '../types';
import { PLAN_LIMITS } from '../config/planLimits';
import type { PlanType, PlanLimitKey } from '../config/planLimits';

interface LicenseStore {
  licenseKey: string;
  activatedAt: string;
  loadLicense: () => void;
  activateLicense: (key: string) => Promise<'success' | 'invalid_format' | 'invalid_key' | 'network_error'>;
  deactivateLicense: () => void;
  getPlan: () => PlanType;
  getLimit: (key: PlanLimitKey) => number;
}

const LICENSE_KEY = 'app-license';
const GIST_RAW_URL = 'https://gist.githubusercontent.com/4uphwang/816c5190b7c33182932aa9e5a7b55906/raw/licenses.json';

/**
 * 키 형식 검증: TMKH-XXXX-XXXX-XXXX (영숫자 대문자)
 */
function isValidKeyFormat(key: string): boolean {
  return /^TMKH-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(key);
}

/**
 * Web Crypto API로 SHA-256 해시 계산
 */
async function sha256(message: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
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
      console.error('Failed to load license:', error);
    }
  },

  activateLicense: async (key: string) => {
    const normalized = key.trim().toUpperCase();

    if (!isValidKeyFormat(normalized)) {
      return 'invalid_format';
    }

    try {
      const keyHash = await sha256(normalized);
      const response = await fetch(GIST_RAW_URL, { cache: 'no-store' });

      if (!response.ok) {
        return 'network_error';
      }

      const data = await response.json() as { hashes: string[] };

      if (!data.hashes || !data.hashes.includes(keyHash)) {
        return 'invalid_key';
      }

      const info: LicenseInfo = {
        licenseKey: normalized,
        activatedAt: new Date().toISOString(),
      };

      localStorage.setItem(LICENSE_KEY, JSON.stringify(info));
      set({ licenseKey: info.licenseKey, activatedAt: info.activatedAt });
      return 'success';
    } catch {
      return 'network_error';
    }
  },

  deactivateLicense: () => {
    localStorage.removeItem(LICENSE_KEY);
    set({ licenseKey: '', activatedAt: '' });
  },

  getPlan: (): PlanType => {
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
