import { useCallback, useEffect, useRef } from 'react';
import { useLockStore } from '../stores/lockStore';

export function useAutoLock() {
  const { isEnabled, autoLockMinutes, lock, loadLockSettings } = useLockStore();
  const lastActivityRef = useRef(Date.now());

  // 앱 시작 시 설정 로드
  useEffect(() => {
    loadLockSettings();
  }, [loadLockSettings]);

  // 활동 감지 리셋
  const resetActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  // 비활성 감지 → 자동 잠금
  useEffect(() => {
    if (!isEnabled || autoLockMinutes <= 0) return;

    const events = ['mousemove', 'keydown', 'mousedown'] as const;
    events.forEach((event) => window.addEventListener(event, resetActivity));

    const interval = setInterval(() => {
      const idleMs = Date.now() - lastActivityRef.current;
      if (idleMs >= autoLockMinutes * 60 * 1000) {
        lock();
      }
    }, 10_000); // 10초마다 체크

    return () => {
      events.forEach((event) => window.removeEventListener(event, resetActivity));
      clearInterval(interval);
    };
  }, [isEnabled, autoLockMinutes, lock, resetActivity]);
}
