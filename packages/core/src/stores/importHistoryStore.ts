// AI 임포트 '처리 내역' 조회 store (일반 앱).
// event_logs에 org 범위 SELECT 정책이 있어(20260906 마이그레이션) 직접 조회 가능.
import { create } from 'zustand';
import { supabase } from '../config/supabase';
import { groupImportLogs, type ImportBatch, type ImportLogRow } from '../ai/import/importHistory';
import { logError } from '../utils/logger';

interface ImportHistoryStore {
  batches: ImportBatch[];
  loading: boolean;
  error: string | null;
  load: () => Promise<void>;
  clear: () => void;
}

export const useImportHistoryStore = create<ImportHistoryStore>((set) => ({
  batches: [],
  loading: false,
  error: null,

  load: async () => {
    set({ loading: true, error: null });
    try {
      if (!supabase) {
        set({ loading: false, error: 'Supabase 미설정' });
        return;
      }
      // RLS로 자기 조직 로그만 반환. 임포트 관련 이벤트만.
      const { data, error } = await supabase
        .from('event_logs')
        .select('event_type, entity_id, entity_label, created_at, payload')
        .in('event_type', ['payment.import_add', 'payment.import_refund', 'payment.import_undo'])
        .order('created_at', { ascending: false })
        .limit(1000);
      if (error) {
        set({ loading: false, error: error.message });
        return;
      }
      set({ batches: groupImportLogs((data ?? []) as ImportLogRow[]), loading: false });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logError('importHistory load failed', { error: e });
      set({ loading: false, error: msg });
    }
  },

  clear: () => set({ batches: [], error: null }),
}));
