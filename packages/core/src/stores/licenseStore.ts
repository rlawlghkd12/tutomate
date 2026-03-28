import { create } from 'zustand';

import type { LicenseInfo } from '../types';
import { PLAN_LIMITS } from '../config/planLimits';
import type { PlanType, PlanLimitKey } from '../config/planLimits';
import { useAuthStore } from './authStore';
import { logError } from '../utils/logger';
import { clearAllCache } from '../utils/dataHelper';
import { useCourseStore } from './courseStore';
import { useStudentStore } from './studentStore';
import { useEnrollmentStore } from './enrollmentStore';
import { useMonthlyPaymentStore } from './monthlyPaymentStore';

export type ActivateResult =
  | { result: 'success'; isNewOrg: boolean; orgChanged: boolean; previousOrgId: string | null }
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

/** 모든 데이터 스토어의 stale 마킹 — 다음 load 시 서버 재조회 */
function invalidateAllStores(): void {
  useCourseStore.getState().invalidate();
  useStudentStore.getState().invalidate();
  useEnrollmentStore.getState().invalidate();
  useMonthlyPaymentStore.getState().invalidate();
}

/**
 * org 전환 후 호출: 캐시 초기화 + stale 마킹 + 스토어 비우기 + 서버에서 다시 로드
 * "이전" / "새로 시작" 모두 사용
 */
export async function reloadAllStores(): Promise<void> {
  await clearAllCache();
  invalidateAllStores();
  useCourseStore.setState({ courses: [] });
  useStudentStore.setState({ students: [] });
  useEnrollmentStore.setState({ enrollments: [] });
  useMonthlyPaymentStore.setState({ payments: [] });
  // 서버에서 새 org 데이터 로드
  await Promise.all([
    useCourseStore.getState().loadCourses(),
    useStudentStore.getState().loadStudents(),
    useEnrollmentStore.getState().loadEnrollments(),
    useMonthlyPaymentStore.getState().loadPayments(),
  ]);
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
      const orgChanged = cloudResult.status === 'success' ? cloudResult.orgChanged : false;
      const previousOrgId = cloudResult.status === 'success' ? cloudResult.previousOrgId : null;
      return { result: 'success', isNewOrg, orgChanged, previousOrgId };
    } catch {
      return { result: 'network_error' };
    }
  },

  deactivateLicense: async () => {
    // Supabase 로그아웃
    await useAuthStore.getState().deactivateCloud();

    // 로컬 캐시 + stale 마킹 + 스토어 데이터 초기화
    await clearAllCache();
    invalidateAllStores();
    useCourseStore.setState({ courses: [] });
    useStudentStore.setState({ students: [] });
    useEnrollmentStore.setState({ enrollments: [] });
    useMonthlyPaymentStore.setState({ payments: [] });

    localStorage.removeItem(LICENSE_KEY);
    set({ licenseKey: '', activatedAt: '' });
  },

  getPlan: (): PlanType => {
    const authState = useAuthStore.getState();
    if (authState.isCloud) {
      // cloud 모드에서는 서버의 plan을 사용 (trial/basic/admin)
      return authState.plan || 'trial';
    }
    // 오프라인 폴백: 로컬 라이선스 키 확인
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
