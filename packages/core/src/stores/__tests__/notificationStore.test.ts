import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useNotificationStore } from '../notificationStore';

describe('notificationStore', () => {
  beforeEach(() => {
    useNotificationStore.setState({ notifications: [] });
    localStorage.clear();
  });

  it('addNotification → 배열 앞에 추가, isRead: false, id 자동 생성', () => {
    useNotificationStore.getState().addNotification({
      type: 'info',
      title: '테스트',
      message: '알림 메시지',
      priority: 'low',
    });
    const notifications = useNotificationStore.getState().notifications;
    expect(notifications).toHaveLength(1);
    expect(notifications[0].isRead).toBe(false);
    expect(notifications[0].id).toBeTruthy();
    expect(notifications[0].title).toBe('테스트');
    expect(notifications[0].createdAt).toBeTruthy();
  });

  it('addNotification → 새 알림이 앞에 추가됨', () => {
    const store = useNotificationStore.getState();
    store.addNotification({ type: 'info', title: '첫번째', message: '', priority: 'low' });
    store.addNotification({ type: 'info', title: '두번째', message: '', priority: 'low' });
    const notifications = useNotificationStore.getState().notifications;
    expect(notifications[0].title).toBe('두번째');
    expect(notifications[1].title).toBe('첫번째');
  });

  it('markAsRead → 특정 알림만 isRead: true', () => {
    const store = useNotificationStore.getState();
    store.addNotification({ type: 'info', title: 'A', message: '', priority: 'low' });
    store.addNotification({ type: 'info', title: 'B', message: '', priority: 'low' });
    const id = useNotificationStore.getState().notifications[0].id;
    useNotificationStore.getState().markAsRead(id);
    const notifications = useNotificationStore.getState().notifications;
    expect(notifications.find(n => n.id === id)!.isRead).toBe(true);
    expect(notifications.find(n => n.id !== id)!.isRead).toBe(false);
  });

  it('markAllAsRead → 전체 isRead: true', () => {
    const store = useNotificationStore.getState();
    store.addNotification({ type: 'info', title: 'A', message: '', priority: 'low' });
    store.addNotification({ type: 'info', title: 'B', message: '', priority: 'low' });
    useNotificationStore.getState().markAllAsRead();
    const all = useNotificationStore.getState().notifications;
    expect(all.every(n => n.isRead)).toBe(true);
  });

  it('deleteNotification → 특정 알림 제거', () => {
    const store = useNotificationStore.getState();
    store.addNotification({ type: 'info', title: 'A', message: '', priority: 'low' });
    store.addNotification({ type: 'info', title: 'B', message: '', priority: 'low' });
    const id = useNotificationStore.getState().notifications[0].id;
    useNotificationStore.getState().deleteNotification(id);
    expect(useNotificationStore.getState().notifications).toHaveLength(1);
    expect(useNotificationStore.getState().notifications[0].id).not.toBe(id);
  });

  it('clearAll → 빈 배열', () => {
    const store = useNotificationStore.getState();
    store.addNotification({ type: 'info', title: 'A', message: '', priority: 'low' });
    useNotificationStore.getState().clearAll();
    expect(useNotificationStore.getState().notifications).toHaveLength(0);
  });

  it('getUnreadCount → 읽지 않은 알림 수', () => {
    const store = useNotificationStore.getState();
    store.addNotification({ type: 'info', title: 'A', message: '', priority: 'low' });
    store.addNotification({ type: 'info', title: 'B', message: '', priority: 'low' });
    expect(useNotificationStore.getState().getUnreadCount()).toBe(2);
    const id = useNotificationStore.getState().notifications[0].id;
    useNotificationStore.getState().markAsRead(id);
    expect(useNotificationStore.getState().getUnreadCount()).toBe(1);
  });

  it('saveNotifications + loadNotifications → localStorage 왕복', () => {
    const store = useNotificationStore.getState();
    store.addNotification({ type: 'payment_overdue', title: '미납', message: '미납알림', priority: 'high' });

    // reset state then load
    useNotificationStore.setState({ notifications: [] });
    expect(useNotificationStore.getState().notifications).toHaveLength(0);

    useNotificationStore.getState().loadNotifications();
    const loaded = useNotificationStore.getState().notifications;
    expect(loaded).toHaveLength(1);
    expect(loaded[0].title).toBe('미납');
    expect(loaded[0].type).toBe('payment_overdue');
  });

  it('빈 state에서 getUnreadCount → 0', () => {
    expect(useNotificationStore.getState().getUnreadCount()).toBe(0);
  });

  it('빈 state에서 markAllAsRead → 에러 없음', () => {
    useNotificationStore.getState().markAllAsRead();
    expect(useNotificationStore.getState().notifications).toHaveLength(0);
  });

  it('빈 state에서 clearAll → 에러 없음', () => {
    useNotificationStore.getState().clearAll();
    expect(useNotificationStore.getState().notifications).toHaveLength(0);
  });

  it('markAsRead — 없는 id → 기존 데이터 유지, 에러 없음', () => {
    const store = useNotificationStore.getState();
    store.addNotification({ type: 'info', title: 'A', message: '', priority: 'low' });
    useNotificationStore.getState().markAsRead('non-existent-id');
    const notifications = useNotificationStore.getState().notifications;
    expect(notifications).toHaveLength(1);
    expect(notifications[0].isRead).toBe(false);
  });

  it('deleteNotification — 없는 id → 기존 데이터 유지', () => {
    const store = useNotificationStore.getState();
    store.addNotification({ type: 'info', title: 'A', message: '', priority: 'low' });
    useNotificationStore.getState().deleteNotification('non-existent');
    expect(useNotificationStore.getState().notifications).toHaveLength(1);
  });

  it('loadNotifications — localStorage 비어있으면 변경 없음', () => {
    useNotificationStore.getState().loadNotifications();
    expect(useNotificationStore.getState().notifications).toHaveLength(0);
  });

  it('loadNotifications — 잘못된 JSON → 에러 무시, 기존 state 유지', () => {
    localStorage.setItem('notifications', 'invalid json{{{');
    useNotificationStore.setState({ notifications: [] });
    // should not throw
    useNotificationStore.getState().loadNotifications();
    expect(useNotificationStore.getState().notifications).toHaveLength(0);
  });

  it('saveNotifications — localStorage.setItem 예외 시 에러 무시', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new Error('QuotaExceededError');
    });

    // saveNotifications 호출 시 예외 발생해도 에러 전파 안 됨
    expect(() => useNotificationStore.getState().saveNotifications()).not.toThrow();

    vi.restoreAllMocks();
  });
});
