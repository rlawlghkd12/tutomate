import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../authStore', () => ({
  isCloud: () => true,
  getOrgId: () => 'test-org-id',
}));

const mockSelect = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) });
const mockInsert = vi.fn().mockResolvedValue({ error: null });
const mockUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
const mockDelete = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });

vi.mock('../../config/supabase', () => ({
  supabase: {
    from: () => ({
      select: mockSelect,
      insert: mockInsert,
      update: mockUpdate,
      delete: mockDelete,
    }),
  },
}));

vi.mock('../../utils/logger', () => ({
  logError: vi.fn(), logWarn: vi.fn(), logInfo: vi.fn(), logDebug: vi.fn(),
}));

import { useStudentStore } from '../studentStore';
import type { Student } from '../../types';

function makeStudent(overrides: Partial<Student> = {}): Student {
  return {
    id: 's1',
    name: '홍길동',
    phone: '010-1234-5678',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('studentStore', () => {
  beforeEach(() => {
    useStudentStore.setState({ students: [] });
  });

  it('addStudent → state에 추가, 생성된 Student 반환', async () => {
    const result = await useStudentStore.getState().addStudent({
      name: '김철수', phone: '010-9999-0000',
    });
    const students = useStudentStore.getState().students;
    expect(students).toHaveLength(1);
    expect(result.name).toBe('김철수');
    expect(result.id).toBeTruthy();
    expect(result.createdAt).toBeTruthy();
  });

  it('addStudent → optional 필드 포함', async () => {
    const result = await useStudentStore.getState().addStudent({
      name: '이영희', phone: '010-1111-2222',
      email: 'lee@test.com', address: '서울시', birthDate: '2000-05-15', notes: '메모',
    });
    expect(result.email).toBe('lee@test.com');
    expect(result.address).toBe('서울시');
    expect(result.birthDate).toBe('2000-05-15');
  });

  it('updateStudent → 부분 업데이트, 다른 필드 유지', async () => {
    useStudentStore.setState({ students: [makeStudent()] });
    await useStudentStore.getState().updateStudent('s1', { name: '홍길순', phone: '010-5555-6666' });
    const s = useStudentStore.getState().getStudentById('s1')!;
    expect(s.name).toBe('홍길순');
    expect(s.phone).toBe('010-5555-6666');
    expect(s.updatedAt).not.toBe('2026-01-01T00:00:00Z');
  });

  it('updateStudent → 여러 학생 중 하나만 업데이트', async () => {
    const s1 = makeStudent({ id: 's1', name: '홍길동' });
    const s2 = makeStudent({ id: 's2', name: '김철수' });
    useStudentStore.setState({ students: [s1, s2] });
    await useStudentStore.getState().updateStudent('s1', { name: '변경됨' });
    expect(useStudentStore.getState().getStudentById('s1')?.name).toBe('변경됨');
    expect(useStudentStore.getState().getStudentById('s2')?.name).toBe('김철수');
  });

  it('getStudentById → 존재하는 id', () => {
    useStudentStore.setState({ students: [makeStudent()] });
    expect(useStudentStore.getState().getStudentById('s1')?.name).toBe('홍길동');
  });

  it('getStudentById → 없는 id → undefined', () => {
    useStudentStore.setState({ students: [makeStudent()] });
    expect(useStudentStore.getState().getStudentById('s999')).toBeUndefined();
  });

  it('deleteStudent → state에서 제거', async () => {
    const s1 = makeStudent({ id: 's1', name: '홍길동' });
    const s2 = makeStudent({ id: 's2', name: '김철수' });
    useStudentStore.setState({ students: [s1, s2] });

    await useStudentStore.getState().deleteStudent('s1');

    const students = useStudentStore.getState().students;
    expect(students).toHaveLength(1);
    expect(students[0].id).toBe('s2');
  });

  it('빈 state에서 getStudentById → undefined', () => {
    expect(useStudentStore.getState().getStudentById('any')).toBeUndefined();
  });

  it('loadStudents → 빈 state에서 빈 배열 유지', async () => {
    await useStudentStore.getState().loadStudents();
    expect(useStudentStore.getState().students).toEqual([]);
  });

  it('여러 학생 관리', async () => {
    await useStudentStore.getState().addStudent({ name: 'A', phone: '1' });
    await useStudentStore.getState().addStudent({ name: 'B', phone: '2' });
    await useStudentStore.getState().addStudent({ name: 'C', phone: '3' });
    expect(useStudentStore.getState().students).toHaveLength(3);
  });

  it('loadStudents — 서버 실패 시 기존 students 유지', async () => {
    const existing = [makeStudent({ id: 'existing' })];
    useStudentStore.setState({ students: existing });

    // invalidate 하여 fresh 상태 해제
    useStudentStore.getState().invalidate();

    // supabase 에러 반환
    mockSelect.mockReturnValueOnce({
      data: null,
      error: { message: 'load fail' },
    });

    await useStudentStore.getState().loadStudents();

    // catch에서 기존 데이터 유지
    expect(useStudentStore.getState().students).toEqual(existing);
  });

  it('addStudent — 서버 실패해도 로컬에 추가', async () => {
    mockInsert.mockResolvedValueOnce({ error: { message: 'insert failed' } });
    const result = await useStudentStore.getState().addStudent({
      name: '실패학생', phone: '010-fail',
    });
    expect(result.name).toBe('실패학생');
    expect(useStudentStore.getState().students).toHaveLength(1);
  });

  it('updateStudent — 서버 실패해도 로컬 반영', async () => {
    useStudentStore.setState({ students: [makeStudent()] });
    mockUpdate.mockReturnValueOnce({
      eq: vi.fn().mockResolvedValue({ error: { message: 'update failed' } }),
    });
    await useStudentStore.getState().updateStudent('s1', { name: '변경됨' });
    expect(useStudentStore.getState().getStudentById('s1')?.name).toBe('변경됨');
  });

  it('loadStudents — 서버 성공 시 students 갱신', async () => {
    useStudentStore.getState().invalidate();

    mockSelect.mockReturnValueOnce({
      data: [{
        id: 's-loaded',
        organization_id: 'org1',
        name: '서버학생',
        phone: '010-0000-0000',
        email: null,
        address: null,
        birth_date: null,
        notes: null,
        is_member: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      }],
      error: null,
    });

    await useStudentStore.getState().loadStudents();

    const students = useStudentStore.getState().students;
    expect(students).toHaveLength(1);
    expect(students[0].name).toBe('서버학생');
  });
});
