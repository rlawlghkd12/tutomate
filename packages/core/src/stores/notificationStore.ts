import { create } from 'zustand';
import type { Notification } from '../types';
import { nanoid } from 'nanoid';
import { logError } from '../utils/logger';
import { getOrgId } from './authStore';

interface NotificationStore {
  notifications: Notification[];
  loadNotifications: () => void;
  saveNotifications: () => void;
  addNotification: (notification: Omit<Notification, 'id' | 'createdAt' | 'isRead'>) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  deleteNotification: (id: string) => void;
  clearAll: () => void;
  getUnreadCount: () => number;
}

function getStorageKey(): string {
  const orgId = getOrgId();
  return orgId ? `notifications_${orgId}` : 'notifications';
}

/** 특정 org의 미읽은 알림 수 (사이드바 표시용) */
export function getUnreadCountForOrg(orgId: string): number {
  try {
    const stored = localStorage.getItem(`notifications_${orgId}`);
    if (!stored) return 0;
    const notifications = JSON.parse(stored) as Notification[];
    return notifications.filter((n) => !n.isRead).length;
  } catch {
    return 0;
  }
}

export const useNotificationStore = create<NotificationStore>((set, get) => ({
  notifications: [],

  loadNotifications: () => {
    try {
      const key = getStorageKey();
      const stored = localStorage.getItem(key);
      if (stored) {
        const notifications = JSON.parse(stored) as Notification[];
        set({ notifications });
      } else {
        // 마이그레이션: 기존 'notifications' 키에서 가져오기
        const legacy = localStorage.getItem('notifications');
        if (legacy) {
          const notifications = JSON.parse(legacy) as Notification[];
          set({ notifications });
          localStorage.setItem(key, legacy);
        }
      }
    } catch (error) {
      logError('Failed to load notifications', { error });
    }
  },

  saveNotifications: () => {
    try {
      const { notifications } = get();
      localStorage.setItem(getStorageKey(), JSON.stringify(notifications));
    } catch (error) {
      logError('Failed to save notifications', { error });
    }
  },

  addNotification: (notification) => {
    const newNotification: Notification = {
      ...notification,
      id: nanoid(),
      createdAt: new Date().toISOString(),
      isRead: false,
    };

    set((state) => ({
      notifications: [newNotification, ...state.notifications],
    }));
    get().saveNotifications();
  },

  markAsRead: (id) => {
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, isRead: true } : n
      ),
    }));
    get().saveNotifications();
  },

  markAllAsRead: () => {
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, isRead: true })),
    }));
    get().saveNotifications();
  },

  deleteNotification: (id) => {
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    }));
    get().saveNotifications();
  },

  clearAll: () => {
    set({ notifications: [] });
    get().saveNotifications();
  },

  getUnreadCount: () => {
    return get().notifications.filter((n) => !n.isRead).length;
  },
}));
