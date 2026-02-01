import { create } from 'zustand';
import type { Notification } from '../types';
import { nanoid } from 'nanoid';

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

const STORAGE_KEY = 'notifications';

export const useNotificationStore = create<NotificationStore>((set, get) => ({
  notifications: [],

  loadNotifications: () => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const notifications = JSON.parse(stored) as Notification[];
        set({ notifications });
      }
    } catch (error) {
      console.error('Failed to load notifications:', error);
    }
  },

  saveNotifications: () => {
    try {
      const { notifications } = get();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications));
    } catch (error) {
      console.error('Failed to save notifications:', error);
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
