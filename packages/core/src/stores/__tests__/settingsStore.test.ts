import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useSettingsStore } from '../settingsStore';

describe('settingsStore', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      theme: 'light',
      fontSize: 'medium',
      notificationsEnabled: true,
    });
    localStorage.clear();
  });

  it('기본값 확인', () => {
    const state = useSettingsStore.getState();
    expect(state.theme).toBe('light');
    expect(state.fontSize).toBe('medium');
    expect(state.notificationsEnabled).toBe(true);
  });

  it('setTheme → dark', () => {
    useSettingsStore.getState().setTheme('dark');
    expect(useSettingsStore.getState().theme).toBe('dark');
  });

  it('setFontSize', () => {
    useSettingsStore.getState().setFontSize('large');
    expect(useSettingsStore.getState().fontSize).toBe('large');
  });

  it('setNotificationsEnabled', () => {
    useSettingsStore.getState().setNotificationsEnabled(false);
    expect(useSettingsStore.getState().notificationsEnabled).toBe(false);
  });

  it('saveSettings + loadSettings → localStorage 왕복', () => {
    useSettingsStore.getState().setTheme('dark');
    useSettingsStore.getState().setFontSize('xl');

    // reset then load
    useSettingsStore.setState({
      theme: 'light', fontSize: 'medium',
      notificationsEnabled: true,
    });
    useSettingsStore.getState().loadSettings();

    expect(useSettingsStore.getState().theme).toBe('dark');
    expect(useSettingsStore.getState().fontSize).toBe('xl');
  });

  it('loadSettings — 잘못된 JSON → 에러 무시', () => {
    localStorage.setItem('app-settings', '{{invalid');
    useSettingsStore.getState().loadSettings();
    // 에러 없이 기존 state 유지
    expect(useSettingsStore.getState().theme).toBe('light');
  });

  it('loadSettings — 레거시 organizationName 필드 무시', () => {
    localStorage.setItem('app-settings', JSON.stringify({
      theme: 'dark',
      fontSize: 'large',
      notificationsEnabled: true,
      organizationName: '레거시 이름',
    }));
    useSettingsStore.getState().loadSettings();
    expect(useSettingsStore.getState().theme).toBe('dark');
    expect(useSettingsStore.getState().fontSize).toBe('large');
    // organizationName은 더 이상 store에 없음
    expect((useSettingsStore.getState() as any).organizationName).toBeUndefined();
  });

  it('setFontSize → small, xl 설정 가능', () => {
    useSettingsStore.getState().setFontSize('small');
    expect(useSettingsStore.getState().fontSize).toBe('small');
    useSettingsStore.getState().setFontSize('xl');
    expect(useSettingsStore.getState().fontSize).toBe('xl');
  });

  it('setFontSize → 7단계 전체 (xs, small, medium, large, xl, xxl, xxxl)', () => {
    const sizes = ['xs', 'small', 'medium', 'large', 'xl', 'xxl', 'xxxl'] as const;
    for (const size of sizes) {
      useSettingsStore.getState().setFontSize(size);
      expect(useSettingsStore.getState().fontSize).toBe(size);
    }
  });

  it('setNotificationsEnabled → false → true 토글', () => {
    useSettingsStore.getState().setNotificationsEnabled(false);
    expect(useSettingsStore.getState().notificationsEnabled).toBe(false);
    useSettingsStore.getState().setNotificationsEnabled(true);
    expect(useSettingsStore.getState().notificationsEnabled).toBe(true);
  });

  it('loadSettings — localStorage 비어있으면 변경 없음', () => {
    useSettingsStore.getState().loadSettings();
    expect(useSettingsStore.getState().theme).toBe('light');
    expect(useSettingsStore.getState().fontSize).toBe('medium');
  });

  it('saveSettings → localStorage에 모든 필드 저장', () => {
    useSettingsStore.getState().setTheme('dark');
    useSettingsStore.getState().setFontSize('large');
    useSettingsStore.getState().setNotificationsEnabled(false);

    const stored = JSON.parse(localStorage.getItem('app-settings')!);
    expect(stored.theme).toBe('dark');
    expect(stored.fontSize).toBe('large');
    expect(stored.notificationsEnabled).toBe(false);
    expect(stored.organizationName).toBeUndefined();
  });

  it('setter 호출 시 자동 저장', () => {
    useSettingsStore.getState().setTheme('dark');
    const stored = JSON.parse(localStorage.getItem('app-settings')!);
    expect(stored.theme).toBe('dark');
  });

  it('saveSettings — localStorage.setItem 예외 시 에러 무시', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new Error('QuotaExceededError');
    });

    // saveSettings 호출 시 예외 발생해도 에러 전파 안 됨
    expect(() => useSettingsStore.getState().saveSettings()).not.toThrow();

    vi.restoreAllMocks();
  });
});
