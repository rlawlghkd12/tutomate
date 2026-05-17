// 이벤트 로그 조회 store (admin 앱 전용).
// 일반 앱에서는 RLS로 SELECT 차단됨 — Supabase 직접 조회 대신 Edge Function(list-event-logs) 사용.
import { create } from 'zustand';
import type { EventLog, EventLogEntityType } from '../types';
import { supabase } from '../config/supabase';
import { useAuthStore } from './authStore';
import { logError } from '../utils/logger';

export interface EventLogFilters {
  organizationId?: string;      // 특정 조직 drill-down
  entityType?: EventLogEntityType;
  entityId?: string;
  eventTypes?: string[];         // 여러 타입 OR
  actorUserId?: string;
  since?: string;                // ISO8601
  until?: string;
  limit?: number;                // default 50
  offset?: number;
}

interface EventLogsResponse {
  logs: EventLog[];
  total: number;
}

interface EventLogStore {
  logs: EventLog[];
  total: number;
  loading: boolean;
  error: string | null;
  loadLogs: (filters?: EventLogFilters) => Promise<void>;
  clear: () => void;
}

export const useEventLogStore = create<EventLogStore>((set) => ({
  logs: [],
  total: 0,
  loading: false,
  error: null,

  loadLogs: async (filters = {}) => {
    set({ loading: true, error: null });
    try {
      if (!supabase) {
        set({ loading: false, error: 'Supabase not configured' });
        return;
      }
      const token = useAuthStore.getState().session?.access_token;
      if (!token) {
        set({ loading: false, error: 'Not authenticated' });
        return;
      }
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/list-event-logs`;
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(filters),
      });
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`list-event-logs failed: ${resp.status} ${text}`);
      }
      const data = (await resp.json()) as EventLogsResponse;
      set({ logs: data.logs, total: data.total, loading: false });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logError('loadLogs failed', { error: e });
      set({ loading: false, error: msg });
    }
  },

  clear: () => set({ logs: [], total: 0, error: null }),
}));
