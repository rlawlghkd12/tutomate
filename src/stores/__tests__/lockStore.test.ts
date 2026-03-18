import { describe, it, expect, beforeEach } from 'vitest';
import { useLockStore } from '../lockStore';

describe('lockStore', () => {
  beforeEach(() => {
    useLockStore.setState({
      isEnabled: false,
      pin: null,
      autoLockMinutes: 0,
      isLocked: false,
    });
    localStorage.clear();
  });

  it('setPin → SHA-256 해시로 저장', async () => {
    await useLockStore.getState().setPin('1234');
    const pin = useLockStore.getState().pin;
    expect(pin).toBeTruthy();
    expect(pin).not.toBe('1234'); // 평문 아님
    expect(pin!.length).toBe(64); // SHA-256 hex = 64 chars
  });

  it('verifyPin 성공 — 같은 PIN → true', async () => {
    await useLockStore.getState().setPin('5678');
    const result = await useLockStore.getState().verifyPin('5678');
    expect(result).toBe(true);
  });

  it('verifyPin 실패 — 다른 PIN → false', async () => {
    await useLockStore.getState().setPin('5678');
    const result = await useLockStore.getState().verifyPin('0000');
    expect(result).toBe(false);
  });

  it('같은 PIN → 항상 같은 해시', async () => {
    await useLockStore.getState().setPin('1234');
    const hash1 = useLockStore.getState().pin;
    await useLockStore.getState().setPin('1234');
    const hash2 = useLockStore.getState().pin;
    expect(hash1).toBe(hash2);
  });

  it('lock — isEnabled && pin 있을 때 → isLocked: true', async () => {
    await useLockStore.getState().setPin('1234');
    useLockStore.getState().setEnabled(true);
    useLockStore.getState().lock();
    expect(useLockStore.getState().isLocked).toBe(true);
  });

  it('lock — isEnabled: false → isLocked 변경 없음', () => {
    useLockStore.getState().lock();
    expect(useLockStore.getState().isLocked).toBe(false);
  });

  it('lock — pin 없으면 → isLocked 변경 없음', () => {
    useLockStore.setState({ isEnabled: true, pin: null });
    useLockStore.getState().lock();
    expect(useLockStore.getState().isLocked).toBe(false);
  });

  it('unlock 성공 — 올바른 PIN → isLocked: false, return true', async () => {
    await useLockStore.getState().setPin('1234');
    useLockStore.setState({ isEnabled: true, isLocked: true });
    const result = await useLockStore.getState().unlock('1234');
    expect(result).toBe(true);
    expect(useLockStore.getState().isLocked).toBe(false);
  });

  it('unlock 실패 — 틀린 PIN → isLocked: true 유지, return false', async () => {
    await useLockStore.getState().setPin('1234');
    useLockStore.setState({ isEnabled: true, isLocked: true });
    const result = await useLockStore.getState().unlock('9999');
    expect(result).toBe(false);
    expect(useLockStore.getState().isLocked).toBe(true);
  });

  it('setEnabled(false) → isEnabled: false, isLocked: false', async () => {
    await useLockStore.getState().setPin('1234');
    useLockStore.setState({ isEnabled: true, isLocked: true });
    useLockStore.getState().setEnabled(false);
    expect(useLockStore.getState().isEnabled).toBe(false);
    expect(useLockStore.getState().isLocked).toBe(false);
  });

  it('saveLockSettings + loadLockSettings → localStorage 왕복', async () => {
    await useLockStore.getState().setPin('1234');
    useLockStore.getState().setEnabled(true);
    useLockStore.getState().setAutoLockMinutes(5);

    const savedPin = useLockStore.getState().pin;

    // reset state then load
    useLockStore.setState({ isEnabled: false, pin: null, autoLockMinutes: 0 });
    useLockStore.getState().loadLockSettings();

    expect(useLockStore.getState().isEnabled).toBe(true);
    expect(useLockStore.getState().pin).toBe(savedPin);
    expect(useLockStore.getState().autoLockMinutes).toBe(5);
  });

  it('loadLockSettings — 잘못된 JSON → 에러 무시', () => {
    localStorage.setItem('app-lock-settings', 'broken{json');
    useLockStore.getState().loadLockSettings();
    // should not throw, state unchanged
    expect(useLockStore.getState().isEnabled).toBe(false);
  });

  // ── PIN 실패 횟수 및 잠금 ──

  it('unlock 실패 시 false 반환, 여전히 잠긴 상태', async () => {
    await useLockStore.getState().setPin('1234');
    useLockStore.getState().setEnabled(true);
    useLockStore.getState().lock();
    expect(useLockStore.getState().isLocked).toBe(true);

    const result = await useLockStore.getState().unlock('9999');
    expect(result).toBe(false);
    expect(useLockStore.getState().isLocked).toBe(true);
  });

  it('연속 실패 후에도 올바른 PIN으로 잠금 해제', async () => {
    await useLockStore.getState().setPin('1234');
    useLockStore.getState().setEnabled(true);
    useLockStore.getState().lock();

    await useLockStore.getState().unlock('0000');
    await useLockStore.getState().unlock('1111');
    await useLockStore.getState().unlock('2222');

    const result = await useLockStore.getState().unlock('1234');
    expect(result).toBe(true);
    expect(useLockStore.getState().isLocked).toBe(false);
  });

  it('4자리 PIN verifyPin 성공', async () => {
    await useLockStore.getState().setPin('1234');
    expect(useLockStore.getState().pin).toBeTruthy();

    const ok = await useLockStore.getState().verifyPin('1234');
    expect(ok).toBe(true);
  });

  it('6자리 PIN verifyPin 성공 + 다른 길이 실패', async () => {
    await useLockStore.getState().setPin('123456');
    expect(useLockStore.getState().pin).toBeTruthy();

    const ok = await useLockStore.getState().verifyPin('123456');
    expect(ok).toBe(true);

    const wrong = await useLockStore.getState().verifyPin('1234');
    expect(wrong).toBe(false);
  });
});
