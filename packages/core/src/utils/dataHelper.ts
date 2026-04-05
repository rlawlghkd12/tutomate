/**
 * 통합 CRUD 헬퍼 — Supabase + 로컬 캐시 + stale 체크
 *
 * load: fresh(3분 이내) → { status: 'skip' }
 *       stale → 서버 로드 → { status: 'ok', data }
 *       서버 실패 + 캐시 → { status: 'cached', data }
 *       서버 실패 + 캐시 없음 → { status: 'error', error }
 * add/update/remove: 성공 → null, 실패 → AppError
 */
import { getOrgId } from '../stores/authStore';
import {
  supabaseLoadData,
  supabaseInsert,
  supabaseUpdate,
  supabaseDelete,
} from './supabaseStorage';
import { AppError, ErrorType, ErrorCode } from './errors';
import { logError, logInfo, logWarn } from './logger';

type TableName = 'courses' | 'students' | 'enrollments' | 'monthly_payments' | 'payment_records';

const STALE_TIME = 3 * 60 * 1000;

export type LoadResult<T> =
  | { status: 'ok'; data: T[] }
  | { status: 'skip' }
  | { status: 'cached'; data: T[] }
  | { status: 'error'; error: AppError };

interface DataHelperConfig<TLocal extends { id: string }, TRow> {
  table: TableName;
  fromDb: (row: TRow) => TLocal;
  toDb: (item: TLocal, orgId: string) => object;
  updateToDb: (updates: Partial<TLocal>) => Record<string, unknown>;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export interface DataHelper<TLocal extends { id: string }, _TRow = unknown> {
  load: () => Promise<LoadResult<TLocal>>;
  add: (item: TLocal) => Promise<AppError | null>;
  update: (id: string, updates: Partial<TLocal>) => Promise<AppError | null>;
  remove: (id: string) => Promise<AppError | null>;
  invalidate: () => void;
}

// ─── 로컬 캐시 (Electron IPC 또는 localStorage 폴백) ───

const CACHE_PREFIX = 'cache_';
const CACHE_TABLES = ['courses', 'students', 'enrollments', 'monthly_payments'];

/** 모든 테이블의 로컬 캐시 삭제 */
export async function clearAllCache(): Promise<void> {
  for (const table of CACHE_TABLES) {
    try {
      if (window.electronAPI?.saveData) {
        await window.electronAPI.saveData(`${CACHE_PREFIX}${table}`, '[]');
      } else {
        localStorage.removeItem(`${CACHE_PREFIX}${table}`);
      }
    } catch {
      // 무시
    }
  }
}

async function saveCache(table: string, data: unknown[]): Promise<void> {
  try {
    const json = JSON.stringify(data);
    if (window.electronAPI?.saveData) {
      await window.electronAPI.saveData(`${CACHE_PREFIX}${table}`, json);
    } else {
      localStorage.setItem(`${CACHE_PREFIX}${table}`, json);
    }
  } catch {
    // 캐시 저장 실패는 무시 (핵심 기능 아님)
  }
}

async function loadCache<T>(table: string): Promise<T[] | null> {
  try {
    let json: string | null = null;
    if (window.electronAPI?.loadData) {
      json = await window.electronAPI.loadData(`${CACHE_PREFIX}${table}`);
    } else {
      json = localStorage.getItem(`${CACHE_PREFIX}${table}`);
    }
    if (!json || json === '[]') return null;
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// ─── Helper 생성 ───

export function createDataHelper<TLocal extends { id: string }, TRow>(
  config: DataHelperConfig<TLocal, TRow>,
): DataHelper<TLocal, TRow> {
  const { table, fromDb, toDb, updateToDb } = config;

  let lastLoadedAt = 0;

  function isFresh(): boolean {
    return Date.now() - lastLoadedAt < STALE_TIME;
  }

  return {
    async load(): Promise<LoadResult<TLocal>> {
      if (isFresh()) {
        return { status: 'skip' };
      }

      try {
        const rows = await supabaseLoadData<TRow>(table);
        const items = rows.map(fromDb);
        lastLoadedAt = Date.now();
        saveCache(table, rows);
        return { status: 'ok', data: items };
      } catch (error) {
        logWarn(`Server load failed for ${table}, trying local cache`, { error });
        const cached = await loadCache<TRow>(table);
        if (cached && cached.length > 0) {
          logInfo(`Loaded ${cached.length} items from local cache: ${table}`);
          lastLoadedAt = Date.now();
          return { status: 'cached', data: cached.map(fromDb) };
        }
        const appError = error instanceof AppError ? error : new AppError({
          type: ErrorType.NETWORK_ERROR,
          message: `Failed to load: ${table}`,
          code: ErrorCode.DB_READ_FAILED,
          originalError: error,
        });
        return { status: 'error', error: appError };
      }
    },

    async add(item: TLocal): Promise<AppError | null> {
      const orgId = getOrgId();
      if (!orgId) {
        return new AppError({
          type: ErrorType.VALIDATION_ERROR,
          message: `No orgId — cannot insert into ${table}`,
          code: ErrorCode.DB_PERMISSION,
        });
      }
      try {
        await supabaseInsert(table, toDb(item, orgId));
        lastLoadedAt = 0; // invalidate
        return null;
      } catch (error) {
        return error instanceof AppError ? error : new AppError({
          type: ErrorType.NETWORK_ERROR,
          message: `Failed to add to ${table}`,
          code: ErrorCode.DB_WRITE_FAILED,
          originalError: error,
        });
      }
    },

    async update(id: string, updates: Partial<TLocal>): Promise<AppError | null> {
      try {
        await supabaseUpdate(table, id, updateToDb(updates));
        lastLoadedAt = 0;
        return null;
      } catch (error) {
        return error instanceof AppError ? error : new AppError({
          type: ErrorType.NETWORK_ERROR,
          message: `Failed to update in ${table}`,
          code: ErrorCode.DB_WRITE_FAILED,
          originalError: error,
        });
      }
    },

    async remove(id: string): Promise<AppError | null> {
      try {
        await supabaseDelete(table, id);
        lastLoadedAt = 0;
        return null;
      } catch (error) {
        return error instanceof AppError ? error : new AppError({
          type: ErrorType.NETWORK_ERROR,
          message: `Failed to delete from ${table}`,
          code: ErrorCode.DB_WRITE_FAILED,
          originalError: error,
        });
      }
    },

    invalidate(): void {
      lastLoadedAt = 0;
    },
  };
}
