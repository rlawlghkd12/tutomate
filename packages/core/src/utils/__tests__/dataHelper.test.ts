import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── Mocks ───

vi.mock('../../../src/stores/authStore', () => ({
  getOrgId: vi.fn(() => 'test-org-id'),
}));

const mockSupabaseLoadData = vi.fn();
const mockSupabaseInsert = vi.fn();
const mockSupabaseUpdate = vi.fn();
const mockSupabaseDelete = vi.fn();

vi.mock('../supabaseStorage', () => ({
  supabaseLoadData: (...args: unknown[]) => mockSupabaseLoadData(...args),
  supabaseInsert: (...args: unknown[]) => mockSupabaseInsert(...args),
  supabaseUpdate: (...args: unknown[]) => mockSupabaseUpdate(...args),
  supabaseDelete: (...args: unknown[]) => mockSupabaseDelete(...args),
}));

vi.mock('../logger', () => ({
  logError: vi.fn(),
  logInfo: vi.fn(),
  logWarn: vi.fn(),
}));

import { createDataHelper, clearAllCache } from '../dataHelper';
import { getOrgId } from '../../stores/authStore';
import { AppError } from '../errors';

// ─── 테스트용 타입 ───

interface TestItem {
  id: string;
  name: string;
}

interface TestRow {
  id: string;
  name: string;
  organization_id: string;
}

function makeHelper() {
  return createDataHelper<TestItem, TestRow>({
    table: 'courses',
    fromDb: (row: TestRow) => ({ id: row.id, name: row.name }),
    toDb: (item: TestItem, orgId: string) => ({ ...item, organization_id: orgId }),
    updateToDb: (updates: Partial<TestItem>) => updates as Record<string, unknown>,
  });
}

// ─── 테스트 ───

describe('dataHelper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    // getOrgId 기본값 복원
    vi.mocked(getOrgId).mockReturnValue('test-org-id');
  });

  // ── load ──

  describe('load', () => {
    it('서버 성공 → status: ok + 데이터 반환 + 로컬 캐시 저장', async () => {
      const rows: TestRow[] = [
        { id: '1', name: '강좌A', organization_id: 'org1' },
        { id: '2', name: '강좌B', organization_id: 'org1' },
      ];
      mockSupabaseLoadData.mockResolvedValue(rows);

      const helper = makeHelper();
      const result = await helper.load();

      expect(result.status).toBe('ok');
      expect(result).toEqual({
        status: 'ok',
        data: [
          { id: '1', name: '강좌A' },
          { id: '2', name: '강좌B' },
        ],
      });
      expect(mockSupabaseLoadData).toHaveBeenCalledWith('courses');

      // 캐시 저장 확인
      const cached = localStorage.getItem('cache_courses');
      expect(cached).toBeTruthy();
      expect(JSON.parse(cached!)).toEqual(rows);
    });

    it('서버 실패 → 로컬 캐시에서 복구 → status: cached', async () => {
      const rows: TestRow[] = [{ id: '1', name: '캐시강좌', organization_id: 'org1' }];
      localStorage.setItem('cache_courses', JSON.stringify(rows));

      mockSupabaseLoadData.mockRejectedValue(new Error('network error'));

      const helper = makeHelper();
      const result = await helper.load();

      expect(result.status).toBe('cached');
      expect(result).toEqual({
        status: 'cached',
        data: [{ id: '1', name: '캐시강좌' }],
      });
    });

    it('서버 실패 + 캐시 없음 → status: error', async () => {
      mockSupabaseLoadData.mockRejectedValue(new Error('network error'));

      const helper = makeHelper();
      const result = await helper.load();

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.error).toBeInstanceOf(AppError);
      }
    });

    it('서버 실패 + 캐시 빈 배열 → status: error', async () => {
      localStorage.setItem('cache_courses', '[]');
      mockSupabaseLoadData.mockRejectedValue(new Error('network error'));

      const helper = makeHelper();
      const result = await helper.load();

      expect(result.status).toBe('error');
    });

    it('fresh 상태면 status: skip', async () => {
      mockSupabaseLoadData.mockResolvedValue([]);

      const helper = makeHelper();
      await helper.load(); // 첫 번째 호출 — 서버 조회

      // 두 번째 호출 — fresh 상태이므로 스킵
      const result = await helper.load();
      expect(result.status).toBe('skip');
      // 서버는 1번만 호출됨
      expect(mockSupabaseLoadData).toHaveBeenCalledTimes(1);
    });

    it('invalidate() 후 → 서버 재조회', async () => {
      mockSupabaseLoadData.mockResolvedValue([]);

      const helper = makeHelper();
      await helper.load(); // 첫 번째
      expect(mockSupabaseLoadData).toHaveBeenCalledTimes(1);

      helper.invalidate();

      await helper.load(); // invalidate 후 → 서버 재조회
      expect(mockSupabaseLoadData).toHaveBeenCalledTimes(2);
    });

    it('stale time 경과 후 → 서버 재조회', async () => {
      mockSupabaseLoadData.mockResolvedValue([]);

      const helper = makeHelper();
      await helper.load();
      expect(mockSupabaseLoadData).toHaveBeenCalledTimes(1);

      // 시간을 3분 이후로 이동
      vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 3 * 60 * 1000 + 1);

      await helper.load();
      expect(mockSupabaseLoadData).toHaveBeenCalledTimes(2);

      vi.restoreAllMocks();
    });

    it('캐시에서 복구 후에도 fresh 상태가 됨', async () => {
      const rows: TestRow[] = [{ id: '1', name: '캐시', organization_id: 'org1' }];
      localStorage.setItem('cache_courses', JSON.stringify(rows));
      mockSupabaseLoadData.mockRejectedValue(new Error('fail'));

      const helper = makeHelper();
      await helper.load(); // 캐시에서 복구

      // 두 번째 호출 — fresh이므로 skip
      const result = await helper.load();
      expect(result.status).toBe('skip');
    });

    it('캐시에 잘못된 JSON → null 반환 → status: error', async () => {
      localStorage.setItem('cache_courses', '{invalid json');
      mockSupabaseLoadData.mockRejectedValue(new Error('server fail'));

      const helper = makeHelper();
      const result = await helper.load();

      expect(result.status).toBe('error');
    });
  });

  // ── add ──

  describe('add', () => {
    it('orgId 있으면 supabaseInsert 호출 → null', async () => {
      mockSupabaseInsert.mockResolvedValue(undefined);

      const helper = makeHelper();
      const item: TestItem = { id: '1', name: '새 강좌' };
      const result = await helper.add(item);

      expect(result).toBeNull();
      expect(mockSupabaseInsert).toHaveBeenCalledWith('courses', {
        id: '1',
        name: '새 강좌',
        organization_id: 'test-org-id',
      });
    });

    it('orgId 없으면 AppError 반환', async () => {
      vi.mocked(getOrgId).mockReturnValue(null);

      const helper = makeHelper();
      const result = await helper.add({ id: '1', name: 'test' });

      expect(result).toBeInstanceOf(AppError);
      expect(mockSupabaseInsert).not.toHaveBeenCalled();
    });

    it('supabaseInsert 실패 → AppError 반환', async () => {
      mockSupabaseInsert.mockRejectedValue(new Error('insert failed'));

      const helper = makeHelper();
      const result = await helper.add({ id: '1', name: 'test' });

      expect(result).toBeInstanceOf(AppError);
    });

    it('add 성공 시 자동 invalidate', async () => {
      mockSupabaseLoadData.mockResolvedValue([]);
      mockSupabaseInsert.mockResolvedValue(undefined);

      const helper = makeHelper();
      await helper.load();
      await helper.add({ id: '1', name: 'new' });

      const result = await helper.load();
      expect(result.status).toBe('ok');
      expect(mockSupabaseLoadData).toHaveBeenCalledTimes(2);
    });
  });

  // ── update ──

  describe('update', () => {
    it('supabaseUpdate 호출 → null', async () => {
      mockSupabaseUpdate.mockResolvedValue(undefined);

      const helper = makeHelper();
      const result = await helper.update('1', { name: '수정됨' });

      expect(result).toBeNull();
      expect(mockSupabaseUpdate).toHaveBeenCalledWith('courses', '1', { name: '수정됨' });
    });

    it('supabaseUpdate 실패 → AppError 반환', async () => {
      mockSupabaseUpdate.mockRejectedValue(new Error('update failed'));

      const helper = makeHelper();
      const result = await helper.update('1', { name: 'x' });

      expect(result).toBeInstanceOf(AppError);
    });

    it('update 성공 시 자동 invalidate', async () => {
      mockSupabaseLoadData.mockResolvedValue([]);
      mockSupabaseUpdate.mockResolvedValue(undefined);

      const helper = makeHelper();
      await helper.load();
      await helper.update('1', { name: 'updated' });

      const result = await helper.load();
      expect(result.status).toBe('ok');
      expect(mockSupabaseLoadData).toHaveBeenCalledTimes(2);
    });
  });

  // ── remove ──

  describe('remove', () => {
    it('삭제 성공 → null', async () => {
      mockSupabaseDelete.mockResolvedValue(undefined);

      const helper = makeHelper();
      const result = await helper.remove('1');

      expect(result).toBeNull();
    });

    it('삭제 실패 → AppError 반환', async () => {
      mockSupabaseDelete.mockRejectedValue(new Error('delete failed'));

      const helper = makeHelper();
      const result = await helper.remove('1');

      expect(result).toBeInstanceOf(AppError);
    });

    it('remove 성공 시 자동 invalidate', async () => {
      mockSupabaseLoadData.mockResolvedValue([]);
      mockSupabaseDelete.mockResolvedValue(undefined);

      const helper = makeHelper();
      await helper.load();
      await helper.remove('1');

      const result = await helper.load();
      expect(result.status).toBe('ok');
      expect(mockSupabaseLoadData).toHaveBeenCalledTimes(2);
    });
  });

  // ── invalidate ──

  describe('invalidate', () => {
    it('invalidate 호출 후 load는 서버 조회', async () => {
      mockSupabaseLoadData.mockResolvedValue([]);

      const helper = makeHelper();
      await helper.load();
      helper.invalidate();

      // invalidate 후에는 서버 재조회
      await helper.load();
      expect(mockSupabaseLoadData).toHaveBeenCalledTimes(2);
    });
  });

  // ── 추가 케이스 ──

  describe('빈 데이터', () => {
    it('supabase가 빈 배열 반환 → status: ok + 빈 배열', async () => {
      mockSupabaseLoadData.mockResolvedValue([]);

      const helper = makeHelper();
      const result = await helper.load();

      expect(result).toEqual({ status: 'ok', data: [] });
      expect(mockSupabaseLoadData).toHaveBeenCalledTimes(1);
    });
  });

  describe('동시 load 호출', () => {
    it('첫 번째 load 성공 후 두 번째는 fresh여서 skip', async () => {
      mockSupabaseLoadData.mockResolvedValue([]);

      const helper = makeHelper();
      await helper.load();
      const result = await helper.load();
      expect(result.status).toBe('skip');
      expect(mockSupabaseLoadData).toHaveBeenCalledTimes(1);
    });

    it('두 개의 fresh하지 않은 helper는 각각 서버 호출', async () => {
      mockSupabaseLoadData.mockResolvedValue([]);

      const helper1 = makeHelper();
      const helper2 = makeHelper();
      await helper1.load();
      await helper2.load();

      expect(mockSupabaseLoadData).toHaveBeenCalledTimes(2);
    });
  });

  describe('electronAPI cache paths', () => {
    it('electronAPI.saveData 사용 시 localStorage 대신 호출', async () => {
      const mockSaveData = vi.fn().mockResolvedValue(undefined);
      const mockLoadData = vi.fn().mockResolvedValue(null);
      (window as any).electronAPI = { saveData: mockSaveData, loadData: mockLoadData };

      mockSupabaseLoadData.mockResolvedValue([{ id: '1', name: 'test', organization_id: 'org1' }]);

      const helper = makeHelper();
      await helper.load();

      // saveCache에서 electronAPI.saveData가 호출됨
      expect(mockSaveData).toHaveBeenCalledWith('cache_courses', expect.any(String));

      (window as any).electronAPI = undefined;
    });

    it('electronAPI.loadData 사용하여 캐시 복구', async () => {
      const cachedData = JSON.stringify([{ id: '1', name: '캐시', organization_id: 'org1' }]);
      const mockSaveData = vi.fn().mockResolvedValue(undefined);
      const mockLoadData = vi.fn().mockResolvedValue(cachedData);
      (window as any).electronAPI = { saveData: mockSaveData, loadData: mockLoadData };

      mockSupabaseLoadData.mockRejectedValue(new Error('server fail'));

      const helper = makeHelper();
      const result = await helper.load();

      expect(result.status).toBe('cached');
      expect(result).toEqual({
        status: 'cached',
        data: [{ id: '1', name: '캐시' }],
      });

      (window as any).electronAPI = undefined;
    });

    it('electronAPI.loadData null 반환 + 서버 실패 → status: error', async () => {
      const mockSaveData = vi.fn().mockResolvedValue(undefined);
      const mockLoadData = vi.fn().mockResolvedValue(null);
      (window as any).electronAPI = { saveData: mockSaveData, loadData: mockLoadData };

      mockSupabaseLoadData.mockRejectedValue(new Error('fail'));

      const helper = makeHelper();
      const result = await helper.load();

      expect(result.status).toBe('error');

      (window as any).electronAPI = undefined;
    });

    it('clearAllCache — electronAPI 사용 시 saveData 호출', async () => {
      const mockSaveData = vi.fn().mockResolvedValue(undefined);
      (window as any).electronAPI = { saveData: mockSaveData };

      await clearAllCache();

      expect(mockSaveData).toHaveBeenCalled();

      (window as any).electronAPI = undefined;
    });
  });

  describe('cache edge cases', () => {
    it('캐시에 비-배열 데이터 → null 반환 → status: error', async () => {
      localStorage.setItem('cache_courses', '"not-an-array"');
      mockSupabaseLoadData.mockRejectedValue(new Error('server fail'));

      const helper = makeHelper();
      const result = await helper.load();

      expect(result.status).toBe('error');
    });

    it('saveCache 실패해도 load 결과에 영향 없음', async () => {
      // localStorage.setItem을 throw하도록 모킹
      const originalSetItem = localStorage.setItem;
      localStorage.setItem = vi.fn().mockImplementation(() => { throw new Error('quota exceeded'); });

      mockSupabaseLoadData.mockResolvedValue([{ id: '1', name: 'test', organization_id: 'org1' }]);

      const helper = makeHelper();
      const result = await helper.load();

      expect(result).toEqual({ status: 'ok', data: [{ id: '1', name: 'test' }] });

      localStorage.setItem = originalSetItem;
    });
  });

  describe('clearAllCache', () => {
    it('clearAllCache 후 로컬 캐시가 없어져 서버 실패 시 status: error', async () => {
      const rows: TestRow[] = [{ id: '1', name: '캐시', organization_id: 'org1' }];
      localStorage.setItem('cache_courses', JSON.stringify(rows));

      await clearAllCache();

      mockSupabaseLoadData.mockRejectedValue(new Error('fail'));
      const helper = makeHelper();
      const result = await helper.load();

      expect(result.status).toBe('error');
    });

    it('clearAllCache는 모든 테이블 캐시 삭제', async () => {
      const tables = ['courses', 'students', 'enrollments', 'monthly_payments'];
      for (const table of tables) {
        localStorage.setItem(`cache_${table}`, JSON.stringify([{ id: '1' }]));
      }

      await clearAllCache();

      for (const table of tables) {
        expect(localStorage.getItem(`cache_${table}`)).toBeNull();
      }
    });
  });
});
