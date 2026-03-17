import { describe, it, expect, beforeEach } from 'vitest';
import { useSettingsStore } from '../settingsStore';

describe('settingsStore', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      theme: 'light',
      fontSize: 'medium',
      notificationsEnabled: true,
      organizationName: '수강생 관리 프로그램',
    });
    localStorage.clear();
  });

  it('기본값 확인', () => {
    const state = useSettingsStore.getState();
    expect(state.theme).toBe('light');
    expect(state.fontSize).toBe('medium');
    expect(state.notificationsEnabled).toBe(true);
    expect(state.organizationName).toBe('수강생 관리 프로그램');
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

  it('setOrganizationName', () => {
    useSettingsStore.getState().setOrganizationName('학원 이름');
    expect(useSettingsStore.getState().organizationName).toBe('학원 이름');
  });

  it('saveSettings + loadSettings → localStorage 왕복', () => {
    useSettingsStore.getState().setTheme('dark');
    useSettingsStore.getState().setFontSize('extra-large');
    useSettingsStore.getState().setOrganizationName('테스트 학원');

    // reset then load
    useSettingsStore.setState({
      theme: 'light', fontSize: 'medium',
      notificationsEnabled: true, organizationName: '초기화됨',
    });
    useSettingsStore.getState().loadSettings();

    expect(useSettingsStore.getState().theme).toBe('dark');
    expect(useSettingsStore.getState().fontSize).toBe('extra-large');
    expect(useSettingsStore.getState().organizationName).toBe('테스트 학원');
  });

  it('loadSettings — 잘못된 JSON → 에러 무시', () => {
    localStorage.setItem('app-settings', '{{invalid');
    useSettingsStore.getState().loadSettings();
    // 에러 없이 기존 state 유지
    expect(useSettingsStore.getState().theme).toBe('light');
  });

  it('setter 호출 시 자동 저장', () => {
    useSettingsStore.getState().setTheme('dark');
    const stored = JSON.parse(localStorage.getItem('app-settings')!);
    expect(stored.theme).toBe('dark');
  });
});
