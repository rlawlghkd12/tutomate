import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock authStore
const mockActivateCloud = vi.fn();
const mockDeactivateCloud = vi.fn();

vi.mock('../authStore', () => ({
  useAuthStore: {
    getState: () => ({
      isCloud: false,
      plan: null,
      activateCloud: mockActivateCloud,
      deactivateCloud: mockDeactivateCloud,
    }),
  },
}));

vi.mock('../../utils/logger', () => ({
  logError: vi.fn(),
}));

import { useLicenseStore } from '../licenseStore';
import { PLAN_LIMITS } from '../../config/planLimits';

describe('licenseStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useLicenseStore.setState({ licenseKey: '', activatedAt: '' });
  });

  // ── getPlan / getLimit ──

  describe('getPlan', () => {
    it('라이선스 없으면 trial', () => {
      expect(useLicenseStore.getState().getPlan()).toBe('trial');
    });

    it('유효한 라이선스 키 있으면 basic', () => {
      useLicenseStore.setState({ licenseKey: 'TMKH-ABCD-1234-WXYZ' });
      expect(useLicenseStore.getState().getPlan()).toBe('basic');
    });

    it('잘못된 형식 키 → trial', () => {
      useLicenseStore.setState({ licenseKey: 'invalid-key' });
      expect(useLicenseStore.getState().getPlan()).toBe('trial');
    });
  });

  describe('getLimit', () => {
    it('trial → maxCourses: 5', () => {
      expect(useLicenseStore.getState().getLimit('maxCourses')).toBe(5);
    });

    it('trial → maxStudentsPerCourse: 10', () => {
      expect(useLicenseStore.getState().getLimit('maxStudentsPerCourse')).toBe(10);
    });

    it('basic → maxCourses: Infinity', () => {
      useLicenseStore.setState({ licenseKey: 'TMKH-ABCD-1234-WXYZ' });
      expect(useLicenseStore.getState().getLimit('maxCourses')).toBe(Infinity);
    });

    it('basic → maxStudentsPerCourse: Infinity', () => {
      useLicenseStore.setState({ licenseKey: 'TMKH-ABCD-1234-WXYZ' });
      expect(useLicenseStore.getState().getLimit('maxStudentsPerCourse')).toBe(Infinity);
    });
  });

  // ── PLAN_LIMITS 상수 검증 ──

  describe('PLAN_LIMITS', () => {
    it('trial 제한 값이 정확함', () => {
      expect(PLAN_LIMITS.trial.maxCourses).toBe(5);
      expect(PLAN_LIMITS.trial.maxStudentsPerCourse).toBe(10);
    });

    it('basic은 무제한', () => {
      expect(PLAN_LIMITS.basic.maxCourses).toBe(Infinity);
      expect(PLAN_LIMITS.basic.maxStudentsPerCourse).toBe(Infinity);
    });

    it('admin은 무제한', () => {
      expect(PLAN_LIMITS.admin.maxCourses).toBe(Infinity);
      expect(PLAN_LIMITS.admin.maxStudentsPerCourse).toBe(Infinity);
    });
  });

  // ── loadLicense ──

  describe('loadLicense', () => {
    it('localStorage에 저장된 라이선스 로드', () => {
      localStorage.setItem('app-license', JSON.stringify({
        licenseKey: 'TMKH-TEST-1234-ABCD',
        activatedAt: '2026-01-01T00:00:00Z',
      }));

      useLicenseStore.getState().loadLicense();
      const state = useLicenseStore.getState();
      expect(state.licenseKey).toBe('TMKH-TEST-1234-ABCD');
      expect(state.activatedAt).toBe('2026-01-01T00:00:00Z');
    });

    it('localStorage 비어있으면 변경 없음', () => {
      useLicenseStore.getState().loadLicense();
      expect(useLicenseStore.getState().licenseKey).toBe('');
    });

    it('손상된 JSON → 에러 무시', () => {
      localStorage.setItem('app-license', '{invalid');
      useLicenseStore.getState().loadLicense();
      expect(useLicenseStore.getState().licenseKey).toBe('');
    });
  });

  // ── activateLicense ──

  describe('activateLicense', () => {
    it('잘못된 형식 → invalid_format', async () => {
      const result = await useLicenseStore.getState().activateLicense('bad-key');
      expect(result).toEqual({ result: 'invalid_format' });
      expect(mockActivateCloud).not.toHaveBeenCalled();
    });

    it('TMKH 형식 통과 → activateCloud 호출', async () => {
      mockActivateCloud.mockResolvedValue({ status: 'success', isNewOrg: false, orgChanged: false });
      const result = await useLicenseStore.getState().activateLicense('TMKH-ABCD-1234-WXYZ');
      expect(result).toEqual({ result: 'success', isNewOrg: false, orgChanged: false });
      expect(mockActivateCloud).toHaveBeenCalledWith('TMKH-ABCD-1234-WXYZ');
    });

    it('TMKA (Admin) 형식도 통과', async () => {
      mockActivateCloud.mockResolvedValue({ status: 'success', isNewOrg: true, orgChanged: false });
      const result = await useLicenseStore.getState().activateLicense('TMKA-ABCD-1234-WXYZ');
      expect(result).toEqual({ result: 'success', isNewOrg: true, orgChanged: false });
    });

    it('TMHA 형식은 invalid (TMK[HA] 패턴만 유효)', async () => {
      const result = await useLicenseStore.getState().activateLicense('TMHA-ABCD-1234-WXYZ');
      expect(result).toEqual({ result: 'invalid_format' });
    });

    it('소문자 → 대문자 변환 후 검증', async () => {
      mockActivateCloud.mockResolvedValue({ status: 'success', isNewOrg: false, orgChanged: false });
      await useLicenseStore.getState().activateLicense('tmkh-abcd-1234-wxyz');
      expect(mockActivateCloud).toHaveBeenCalledWith('TMKH-ABCD-1234-WXYZ');
    });

    it('activateCloud max_seats_reached → max_seats_reached', async () => {
      mockActivateCloud.mockResolvedValue({ status: 'max_seats_reached' });
      const result = await useLicenseStore.getState().activateLicense('TMKH-ABCD-1234-WXYZ');
      expect(result).toEqual({ result: 'max_seats_reached' });
    });

    it('activateCloud invalid_key → invalid_key', async () => {
      mockActivateCloud.mockResolvedValue({ status: 'invalid_key' });
      const result = await useLicenseStore.getState().activateLicense('TMKH-ABCD-1234-WXYZ');
      expect(result).toEqual({ result: 'invalid_key' });
    });

    it('activateCloud error → network_error', async () => {
      mockActivateCloud.mockResolvedValue({ status: 'error' });
      const result = await useLicenseStore.getState().activateLicense('TMKH-ABCD-1234-WXYZ');
      expect(result).toEqual({ result: 'network_error' });
    });

    it('activateCloud throw → network_error', async () => {
      mockActivateCloud.mockRejectedValue(new Error('network'));
      const result = await useLicenseStore.getState().activateLicense('TMKH-ABCD-1234-WXYZ');
      expect(result).toEqual({ result: 'network_error' });
    });

    it('성공 시 localStorage에 저장', async () => {
      mockActivateCloud.mockResolvedValue({ status: 'success', isNewOrg: false, orgChanged: false });
      await useLicenseStore.getState().activateLicense('TMKH-ABCD-1234-WXYZ');

      const stored = JSON.parse(localStorage.getItem('app-license')!);
      expect(stored.licenseKey).toBe('TMKH-ABCD-1234-WXYZ');
      expect(stored.activatedAt).toBeTruthy();
    });
  });

  // ── deactivateLicense ──

  describe('deactivateLicense', () => {
    it('deactivateCloud 호출 + localStorage 제거 + state 초기화', async () => {
      mockDeactivateCloud.mockResolvedValue(undefined);
      useLicenseStore.setState({ licenseKey: 'TMKH-ABCD-1234-WXYZ', activatedAt: '2026-01-01' });
      localStorage.setItem('app-license', '{}');

      await useLicenseStore.getState().deactivateLicense();

      expect(mockDeactivateCloud).toHaveBeenCalled();
      expect(localStorage.getItem('app-license')).toBeNull();
      expect(useLicenseStore.getState().licenseKey).toBe('');
      expect(useLicenseStore.getState().activatedAt).toBe('');
    });
  });

  // ── activateLicense 성공 후 state ──

  describe('activateLicense state changes', () => {
    it('성공 시 licenseKey + activatedAt 업데이트', async () => {
      mockActivateCloud.mockResolvedValue({ status: 'success', isNewOrg: true, orgChanged: false, previousOrgId: null });
      await useLicenseStore.getState().activateLicense('TMKH-ABCD-1234-WXYZ');

      const state = useLicenseStore.getState();
      expect(state.licenseKey).toBe('TMKH-ABCD-1234-WXYZ');
      expect(state.activatedAt).toBeTruthy();
    });

    it('실패 시 state 변경 없음', async () => {
      mockActivateCloud.mockResolvedValue({ status: 'invalid_key' });
      await useLicenseStore.getState().activateLicense('TMKH-ABCD-1234-WXYZ');

      expect(useLicenseStore.getState().licenseKey).toBe('');
      expect(useLicenseStore.getState().activatedAt).toBe('');
    });

    it('orgChanged true → previousOrgId 포함', async () => {
      mockActivateCloud.mockResolvedValue({
        status: 'success', isNewOrg: false, orgChanged: true, previousOrgId: 'old-org',
      });
      const result = await useLicenseStore.getState().activateLicense('TMKH-ABCD-1234-WXYZ');
      expect(result).toEqual({
        result: 'success', isNewOrg: false, orgChanged: true, previousOrgId: 'old-org',
      });
    });
  });

  // ── 키 형식 검증 ──

  describe('키 형식 검증', () => {
    it('TMKH-XXXX-XXXX-XXXX 유효', async () => {
      mockActivateCloud.mockResolvedValue({ status: 'success', isNewOrg: false, orgChanged: false });
      const r = await useLicenseStore.getState().activateLicense('TMKH-ABCD-1234-WXYZ');
      expect(r.result).toBe('success');
    });

    it('TMK로 시작하지 않으면 invalid', async () => {
      const r = await useLicenseStore.getState().activateLicense('ABCD-ABCD-1234-WXYZ');
      expect(r.result).toBe('invalid_format');
    });

    it('4자리가 아닌 세그먼트 → invalid', async () => {
      const r = await useLicenseStore.getState().activateLicense('TMKH-ABC-1234-WXYZ');
      expect(r.result).toBe('invalid_format');
    });

    it('특수문자 포함 → invalid', async () => {
      const r = await useLicenseStore.getState().activateLicense('TMKH-AB@D-1234-WXYZ');
      expect(r.result).toBe('invalid_format');
    });

    it('소문자도 대문자 변환 후 유효', async () => {
      mockActivateCloud.mockResolvedValue({ status: 'success', isNewOrg: false, orgChanged: false });
      const r = await useLicenseStore.getState().activateLicense('tmkh-abcd-1234-wxyz');
      expect(r.result).toBe('success');
    });
  });
});
