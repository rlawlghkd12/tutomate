import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Supabase 모킹 ────────────────────────────────────────────────────────
// vi.mock은 최상위로 호이스팅되므로, factory 내부에서 직접 mock 함수를 정의해야 함

const mockEq = vi.fn();
const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdateEq = vi.fn();
const mockUpdate = vi.fn(() => ({ eq: mockUpdateEq }));
const mockDeleteEq = vi.fn();
const mockDeleteFn = vi.fn(() => ({ eq: mockDeleteEq }));
const mockFrom = vi.fn(() => ({
  select: mockSelect,
  insert: mockInsert,
  update: mockUpdate,
  delete: mockDeleteFn,
}));

vi.mock('../../config/supabase', () => {
  const mockEqInner = vi.fn();
  const mockSelectInner = vi.fn();
  const mockInsertInner = vi.fn();
  const mockUpdateInner = vi.fn(() => ({ eq: mockEqInner }));
  const mockDeleteInner = vi.fn(() => ({ eq: mockEqInner }));
  const mockFromInner = vi.fn(() => ({
    select: mockSelectInner,
    insert: mockInsertInner,
    update: mockUpdateInner,
    delete: mockDeleteInner,
  }));
  return {
    supabase: { from: mockFromInner },
  };
});

vi.mock('../logger', () => ({
  logError: vi.fn(),
  logInfo: vi.fn(),
  logWarn: vi.fn(),
}));

import {
  supabaseLoadData,
  supabaseInsert,
  supabaseUpdate,
  supabaseDelete,
  supabaseBulkInsert,
} from '../supabaseStorage';
import { AppError } from '../errors';

// supabase 모듈을 가져와서 내부 from mock에 접근
import { supabase } from '../../config/supabase';

// ─── 헬퍼: supabase.from().xxx 를 원하는 응답으로 설정 ─────────────────────────

function setupSelectResponse(response: { data: unknown[] | null; error: unknown }) {
  const eqMock = vi.fn().mockResolvedValue(response);
  const selectMock = vi.fn().mockResolvedValue(response);
  (supabase!.from as ReturnType<typeof vi.fn>).mockReturnValue({
    select: selectMock,
    insert: vi.fn(),
    update: vi.fn(() => ({ eq: eqMock })),
    delete: vi.fn(() => ({ eq: eqMock })),
  });
  return { selectMock, eqMock };
}

function setupInsertResponse(response: { error: unknown }) {
  const insertMock = vi.fn().mockResolvedValue(response);
  (supabase!.from as ReturnType<typeof vi.fn>).mockReturnValue({
    select: vi.fn(),
    insert: insertMock,
    update: vi.fn(() => ({ eq: vi.fn() })),
    delete: vi.fn(() => ({ eq: vi.fn() })),
  });
  return { insertMock };
}

function setupEqResponse(method: 'update' | 'delete', response: { error: unknown }) {
  const eqMock = vi.fn().mockResolvedValue(response);
  const methodMock = vi.fn(() => ({ eq: eqMock }));
  (supabase!.from as ReturnType<typeof vi.fn>).mockReturnValue({
    select: vi.fn(),
    insert: vi.fn(),
    update: method === 'update' ? methodMock : vi.fn(() => ({ eq: vi.fn() })),
    delete: method === 'delete' ? methodMock : vi.fn(() => ({ eq: vi.fn() })),
  });
  return { eqMock, methodMock };
}

// ─── supabaseLoadData ─────────────────────────────────────────────────────

describe('supabaseLoadData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('성공 → 데이터 반환', async () => {
    const rows = [{ id: '1', name: '수학반' }];
    const { selectMock } = setupSelectResponse({ data: rows, error: null });

    const result = await supabaseLoadData('courses');
    expect(result).toEqual(rows);
    expect(supabase!.from).toHaveBeenCalledWith('courses');
    expect(selectMock).toHaveBeenCalledWith('*');
  });

  it('supabase 에러 → AppError throw (NETWORK_ERROR)', async () => {
    setupSelectResponse({ data: null, error: { message: 'DB error' } });
    await expect(supabaseLoadData('courses')).rejects.toBeInstanceOf(AppError);
  });

  it('AppError type은 NETWORK_ERROR', async () => {
    setupSelectResponse({ data: null, error: { message: 'fail' } });
    try {
      await supabaseLoadData('students');
    } catch (e) {
      expect((e as AppError).type).toBe('NETWORK_ERROR');
    }
  });

  it('빈 배열 반환 → 정상 처리', async () => {
    setupSelectResponse({ data: [], error: null });
    const result = await supabaseLoadData('students');
    expect(result).toEqual([]);
  });

  it('enrollments 테이블', async () => {
    setupSelectResponse({ data: [], error: null });
    await expect(supabaseLoadData('enrollments')).resolves.toEqual([]);
    expect(supabase!.from).toHaveBeenCalledWith('enrollments');
  });

  it('monthly_payments 테이블', async () => {
    setupSelectResponse({ data: [{ id: 'mp1' }], error: null });
    const result = await supabaseLoadData('monthly_payments');
    expect(result).toHaveLength(1);
  });
});

// ─── supabaseInsert ───────────────────────────────────────────────────────

describe('supabaseInsert', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('성공 → void (에러 없음)', async () => {
    const { insertMock } = setupInsertResponse({ error: null });
    await expect(supabaseInsert('courses', { id: '1', name: '수학' })).resolves.toBeUndefined();
    expect(insertMock).toHaveBeenCalled();
  });

  it('에러 → AppError throw (NETWORK_ERROR)', async () => {
    setupInsertResponse({ error: { message: 'Insert failed' } });
    await expect(supabaseInsert('courses', { id: '1' })).rejects.toBeInstanceOf(AppError);
  });

  it('students 테이블 insert', async () => {
    setupInsertResponse({ error: null });
    await expect(supabaseInsert('students', { id: 's1', name: '홍' })).resolves.toBeUndefined();
    expect(supabase!.from).toHaveBeenCalledWith('students');
  });

  it('insert payload가 올바르게 전달됨', async () => {
    const { insertMock } = setupInsertResponse({ error: null });
    const payload = { id: 'c1', name: '수학반', organization_id: 'org1' };
    await supabaseInsert('courses', payload);
    expect(insertMock).toHaveBeenCalledWith(payload);
  });
});

// ─── supabaseUpdate ───────────────────────────────────────────────────────

describe('supabaseUpdate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('성공 → void', async () => {
    setupEqResponse('update', { error: null });
    await expect(supabaseUpdate('courses', 'c1', { name: '수정됨' })).resolves.toBeUndefined();
  });

  it('에러 → AppError throw', async () => {
    setupEqResponse('update', { error: { message: 'Update failed' } });
    await expect(supabaseUpdate('courses', 'c1', {})).rejects.toBeInstanceOf(AppError);
  });

  it('update 시 id로 eq 필터링', async () => {
    const { eqMock } = setupEqResponse('update', { error: null });
    await supabaseUpdate('courses', 'test-id', { fee: 100000 });
    expect(eqMock).toHaveBeenCalledWith('id', 'test-id');
  });

  it('enrollments 테이블 update', async () => {
    setupEqResponse('update', { error: null });
    await expect(supabaseUpdate('enrollments', 'e1', { payment_status: 'paid' })).resolves.toBeUndefined();
    expect(supabase!.from).toHaveBeenCalledWith('enrollments');
  });
});

// ─── supabaseDelete ───────────────────────────────────────────────────────

describe('supabaseDelete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('성공 → void', async () => {
    setupEqResponse('delete', { error: null });
    await expect(supabaseDelete('courses', 'c1')).resolves.toBeUndefined();
  });

  it('에러 → AppError throw (NETWORK_ERROR)', async () => {
    setupEqResponse('delete', { error: { message: 'Delete failed' } });
    await expect(supabaseDelete('courses', 'c1')).rejects.toBeInstanceOf(AppError);
  });

  it('delete 시 id로 eq 필터링', async () => {
    const { eqMock } = setupEqResponse('delete', { error: null });
    await supabaseDelete('students', 'student-123');
    expect(eqMock).toHaveBeenCalledWith('id', 'student-123');
  });

  it('students 테이블 delete', async () => {
    setupEqResponse('delete', { error: null });
    await expect(supabaseDelete('students', 's1')).resolves.toBeUndefined();
    expect(supabase!.from).toHaveBeenCalledWith('students');
  });
});

// ─── supabaseBulkInsert ───────────────────────────────────────────────────

describe('supabaseBulkInsert', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('빈 배열 → early return (supabase.from 호출 없음)', async () => {
    await expect(supabaseBulkInsert('courses', [])).resolves.toBeUndefined();
    expect(supabase!.from).not.toHaveBeenCalled();
  });

  it('데이터 있으면 insert 호출', async () => {
    const { insertMock } = setupInsertResponse({ error: null });
    const items = [{ id: '1', name: 'A' }, { id: '2', name: 'B' }];
    await expect(supabaseBulkInsert('courses', items)).resolves.toBeUndefined();
    expect(insertMock).toHaveBeenCalledWith(items);
  });

  it('insert 에러 → AppError throw', async () => {
    setupInsertResponse({ error: { message: 'Bulk insert failed' } });
    await expect(supabaseBulkInsert('courses', [{ id: '1' }])).rejects.toBeInstanceOf(AppError);
  });

  it('enrollments 테이블 bulk insert', async () => {
    setupInsertResponse({ error: null });
    await expect(supabaseBulkInsert('enrollments', [{ id: 'e1' }])).resolves.toBeUndefined();
    expect(supabase!.from).toHaveBeenCalledWith('enrollments');
  });

  it('단일 항목 bulk insert', async () => {
    const { insertMock } = setupInsertResponse({ error: null });
    await supabaseBulkInsert('students', [{ id: 's1' }]);
    expect(insertMock).toHaveBeenCalledTimes(1);
  });
});
