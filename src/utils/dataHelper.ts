/**
 * 통합 CRUD 헬퍼 — Supabase + 로컬 캐시 + stale 체크
 *
 * load: fresh(5분 이내) → store 기존 데이터 유지 (서버 호출 스킵)
 *       stale → 서버 로드 → 로컬 캐시 갱신
 *       서버 실패 → 로컬 캐시에서 반환
 * add/update/remove: 서버 쓰기 후 stale 마킹 (다음 load 시 서버 재조회)
 */
import { getOrgId } from '../stores/authStore';
import {
  supabaseLoadData,
  supabaseInsert,
  supabaseUpdate,
  supabaseDelete,
} from './supabaseStorage';
import { logError, logInfo, logWarn } from './logger';

type TableName = 'courses' | 'students' | 'enrollments' | 'monthly_payments';

/** load() 스킵 판단 기준 (밀리초) */
const STALE_TIME = 3 * 60 * 1000; // 3분

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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export interface DataHelper<TLocal extends { id: string }, _TRow = unknown> {
  load: () => Promise<TLocal[]>;
  add: (item: TLocal) => Promise<void>;
  update: (id: string, updates: Partial<TLocal>) => Promise<void>;
  remove: (id: string, currentItems: TLocal[]) => Promise<TLocal[]>;
  /** stale 마킹 — 다음 load()에서 강제 서버 조회 */
  invalidate: () => void;
}

// ─── 로컬 캐시 (Electron IPC 또는 localStorage 폴백) ───

const CACHE_PREFIX = 'cache_';

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
    async load(): Promise<TLocal[]> {
      // fresh 상태면 서버 호출 스킵 → store의 catch에서 기존 데이터 유지
      if (isFresh()) {
        throw new SkipLoadError(table);
      }

      try {
        const rows = await supabaseLoadData<TRow>(table);
        const items = rows.map(fromDb);
        lastLoadedAt = Date.now();
        // 로컬 캐시 갱신 (비동기, 에러 무시)
        saveCache(table, rows);
        return items;
      } catch (error) {
        if (error instanceof SkipLoadError) throw error;
        // 서버 실패 → 로컬 캐시에서 복구 시도
        logWarn(`Server load failed for ${table}, trying local cache`, { error });
        const cached = await loadCache<TRow>(table);
        if (cached && cached.length > 0) {
          logInfo(`Loaded ${cached.length} items from local cache: ${table}`);
          lastLoadedAt = Date.now();
          return cached.map(fromDb);
        }
        throw error;
      }
    },

    async add(item: TLocal): Promise<void> {
      const orgId = getOrgId();
      if (!orgId) {
        throw new Error(`No orgId — cannot insert into ${table}`);
      }
      await supabaseInsert(table, toDb(item, orgId));
    },

    async update(id: string, updates: Partial<TLocal>): Promise<void> {
      await supabaseUpdate(table, id, updateToDb(updates));
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

    invalidate(): void {
      lastLoadedAt = 0;
    },
  };
}

/** load() 스킵 시 throw하는 내부 에러 (store catch에서 기존 데이터 유지) */
class SkipLoadError extends Error {
  constructor(table: string) {
    super(`Skip load: ${table} is still fresh`);
    this.name = 'SkipLoadError';
  }
}
