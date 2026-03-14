/**
 * 통합 CRUD 헬퍼 — Supabase only
 */
import { getOrgId } from '../stores/authStore';
import {
  supabaseLoadData,
  supabaseInsert,
  supabaseUpdate,
  supabaseDelete,
} from './supabaseStorage';
import { logError } from './logger';

type TableName = 'courses' | 'students' | 'enrollments' | 'monthly_payments';

interface DataHelperConfig<TLocal extends { id: string }, TRow> {
  /** Supabase 테이블 이름 */
  table: TableName;
  /** DB Row → 로컬 타입 변환 */
  fromDb: (row: TRow) => TLocal;
  /** 로컬 타입 → DB Row 변환 (insert 용, orgId 필요) */
  toDb: (item: TLocal, orgId: string) => object;
  /** Partial 로컬 타입 → DB update 객체 변환 */
  updateToDb: (updates: Partial<TLocal>) => Record<string, unknown>;
}

export interface DataHelper<TLocal extends { id: string }, _TRow = unknown> {
  load: () => Promise<TLocal[]>;
  add: (item: TLocal) => Promise<TLocal[]>;
  update: (id: string, updates: Partial<TLocal>) => Promise<TLocal[]>;
  remove: (id: string, currentItems: TLocal[]) => Promise<TLocal[]>;
}

export function createDataHelper<TLocal extends { id: string }, TRow>(
  config: DataHelperConfig<TLocal, TRow>,
): DataHelper<TLocal, TRow> {
  const { table, fromDb, toDb, updateToDb } = config;

  return {
    async load(): Promise<TLocal[]> {
      try {
        const rows = await supabaseLoadData<TRow>(table);
        return rows.map(fromDb);
      } catch (error) {
        logError(`Failed to load ${table} from cloud`, { error });
        return [];
      }
    },

    async add(item: TLocal): Promise<TLocal[]> {
      const orgId = getOrgId();
      if (!orgId) return [];
      try {
        await supabaseInsert(table, toDb(item, orgId));
        return [];
      } catch (error) {
        logError(`Failed to add to ${table} in cloud`, { error });
        return [];
      }
    },

    async update(id: string, updates: Partial<TLocal>): Promise<TLocal[]> {
      try {
        await supabaseUpdate(table, id, updateToDb(updates));
        return [];
      } catch (error) {
        logError(`Failed to update ${table} in cloud`, { error });
        return [];
      }
    },

    async remove(id: string, currentItems: TLocal[]): Promise<TLocal[]> {
      try {
        await supabaseDelete(table, id);
        return currentItems.filter((item) => item.id !== id);
      } catch (error) {
        logError(`Failed to delete from ${table} in cloud`, { error });
        return currentItems;
      }
    },
  };
}
