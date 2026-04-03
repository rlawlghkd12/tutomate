// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useLockStore } from '../../stores/lockStore';
import { useAutoLock } from '../useAutoLock';

describe('useAutoLock', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useLockStore.setState({
      isEnabled: false,
      pin: null,
      autoLockMinutes: 0,
      isLocked: false,
    });
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('앱 시작 시 loadLockSettings 호출', () => {
    const loadSpy = vi.spyOn(useLockStore.getState(), 'loadLockSettings');
    renderHook(() => useAutoLock());
    expect(loadSpy).toHaveBeenCalled();
    loadSpy.mockRestore();
  });

  it('isEnabled && pin 설정 시 앱 시작 시 lock 호출', async () => {
    // Set pin first (requires real crypto) and save to localStorage
    vi.useRealTimers();
    await useLockStore.getState().setPin('1234');
    useLockStore.getState().setEnabled(true);
    // saveLockSettings is called inside setEnabled/setPin, so localStorage has the settings
    vi.useFakeTimers();

    // Reset isLocked to verify the hook sets it
    useLockStore.setState({ isLocked: false });

    renderHook(() => useAutoLock());

    // loadLockSettings restores isEnabled + pin from localStorage, then lock() is called
    expect(useLockStore.getState().isLocked).toBe(true);
  });

  it('isEnabled=false → 자동 잠금 안 함 (이벤트 리스너 미등록)', () => {
    useLockStore.setState({ isEnabled: false, autoLockMinutes: 5 });

    renderHook(() => useAutoLock());

    // Advance well past the auto-lock time
    vi.advanceTimersByTime(10 * 60 * 1000);

    expect(useLockStore.getState().isLocked).toBe(false);
  });

  it('autoLockMinutes=0 → 자동 잠금 비활성', () => {
    useLockStore.setState({ isEnabled: true, pin: 'hashed-pin', autoLockMinutes: 0 });

    renderHook(() => useAutoLock());

    vi.advanceTimersByTime(60 * 60 * 1000); // 1 hour

    // lock() is called in the initial useEffect (isEnabled && pin),
    // but not by the auto-lock interval since autoLockMinutes=0
    // Reset the lock to test interval behavior only
    useLockStore.setState({ isLocked: false });
    vi.advanceTimersByTime(60 * 60 * 1000);
    expect(useLockStore.getState().isLocked).toBe(false);
  });

  it('비활성 시간 경과 후 자동 잠금', () => {
    useLockStore.setState({ isEnabled: true, pin: 'hashed-pin', autoLockMinutes: 1 });

    renderHook(() => useAutoLock());

    // Initial lock from useEffect — reset it
    useLockStore.setState({ isLocked: false });

    // Advance past the auto-lock time (1 min) + check interval (10s)
    vi.advanceTimersByTime(70 * 1000);

    expect(useLockStore.getState().isLocked).toBe(true);
  });

  it('mousemove 이벤트로 활동 리셋 → 잠금 지연', () => {
    useLockStore.setState({ isEnabled: true, pin: 'hashed-pin', autoLockMinutes: 1 });

    renderHook(() => useAutoLock());

    // Initial lock from useEffect — reset it
    useLockStore.setState({ isLocked: false });

    // 50초 경과
    vi.advanceTimersByTime(50 * 1000);

    // Activity — reset timer
    window.dispatchEvent(new Event('mousemove'));

    // 50초 더 경과 (총 100초이지만 리셋 후 50초)
    vi.advanceTimersByTime(50 * 1000);

    // Should not be locked yet (only 50s since last activity, need 60s)
    expect(useLockStore.getState().isLocked).toBe(false);

    // 20초 더 → 리셋 후 70초 경과 + interval check
    vi.advanceTimersByTime(20 * 1000);

    expect(useLockStore.getState().isLocked).toBe(true);
  });

  it('cleanup 시 이벤트 리스너 해제', () => {
    useLockStore.setState({ isEnabled: true, pin: 'hashed-pin', autoLockMinutes: 5 });

    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useAutoLock());

    unmount();

    // Should have removed mousemove, keydown, mousedown listeners
    const removedEvents = removeSpy.mock.calls.map((c) => c[0]);
    expect(removedEvents).toContain('mousemove');
    expect(removedEvents).toContain('keydown');
    expect(removedEvents).toContain('mousedown');

    removeSpy.mockRestore();
  });
});
