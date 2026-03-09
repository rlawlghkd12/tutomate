/**
 * 통합 CRUD 헬퍼
 * Cloud(Supabase) / Local(Tauri+localStorage) 분기를 한 곳에서 관리
 */
import { isCloud, getOrgId } from '../stores/authStore';
import {
  addToStorage,
  updateInStorage,
  deleteFromStorage,
  loadData,
} from './storage';
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
  /** storage.ts STORAGE_KEYS 값 */
  storageKey: string;
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

/**
 * 엔터티별 CRUD 헬퍼를 생성
 *
 * @example
 * const courseHelper = createDataHelper({
 *   table: 'courses',
 *   storageKey: STORAGE_KEYS.COURSES,
 *   fromDb: mapCourseFromDb,
 *   toDb: mapCourseToDb,
 *   updateToDb: mapCourseUpdateToDb,
 * });
 *
 * // 스토어에서 사용
 * const courses = await courseHelper.load();
 */
export function createDataHelper<TLocal extends { id: string }, TRow>(
  config: DataHelperConfig<TLocal, TRow>,
): DataHelper<TLocal, TRow> {
  const { table, storageKey, fromDb, toDb, updateToDb } = config;

  return {
    /** 전체 데이터 로드 */
    async load(): Promise<TLocal[]> {
      if (isCloud()) {
        try {
          const rows = await supabaseLoadData<TRow>(table);
          return rows.map(fromDb);
        } catch (error) {
          logError(`Failed to load ${table} from cloud`, { error });
          return [];
        }
      }
      return loadData<TLocal>(storageKey);
    },

    /** 항목 추가 — 성공 시 갱신된 전체 배열 반환 */
    async add(item: TLocal): Promise<TLocal[]> {
      if (isCloud()) {
        const orgId = getOrgId();
        if (!orgId) return [];
        try {
          await supabaseInsert(table, toDb(item, orgId));
          // 클라우드에서는 현재 목록을 다시 로드하지 않고 호출 측에서 낙관적 업데이트
          return [];
        } catch (error) {
          logError(`Failed to add to ${table} in cloud`, { error });
          return [];
        }
      }
      return addToStorage(storageKey, item);
    },

    /** 항목 업데이트 */
    async update(id: string, updates: Partial<TLocal>): Promise<TLocal[]> {
      if (isCloud()) {
        try {
          await supabaseUpdate(table, id, updateToDb(updates));
          return [];
        } catch (error) {
          logError(`Failed to update ${table} in cloud`, { error });
          return [];
        }
      }
      return updateInStorage(storageKey, id, updates);
    },

    /** 항목 삭제 */
    async remove(id: string, currentItems: TLocal[]): Promise<TLocal[]> {
      if (isCloud()) {
        try {
          await supabaseDelete(table, id);
          return currentItems.filter((item) => item.id !== id);
        } catch (error) {
          logError(`Failed to delete from ${table} in cloud`, { error });
          return currentItems;
        }
      }
      return deleteFromStorage<TLocal>(storageKey, id);
    },
  };
}
