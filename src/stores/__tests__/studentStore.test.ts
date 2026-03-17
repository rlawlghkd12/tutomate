import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../authStore', () => ({
  isCloud: () => true,
  getOrgId: () => 'test-org-id',
}));

const mockSelect = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) });
const mockInsert = vi.fn().mockResolvedValue({ error: null });
const mockUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
const mockDelete = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });

vi.mock('../../lib/supabase', () => ({
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

  it('getStudentById → 존재하는 id', () => {
    useStudentStore.setState({ students: [makeStudent()] });
    expect(useStudentStore.getState().getStudentById('s1')?.name).toBe('홍길동');
  });

  it('getStudentById → 없는 id → undefined', () => {
    useStudentStore.setState({ students: [makeStudent()] });
    expect(useStudentStore.getState().getStudentById('s999')).toBeUndefined();
  });

  it('여러 학생 관리', async () => {
    await useStudentStore.getState().addStudent({ name: 'A', phone: '1' });
    await useStudentStore.getState().addStudent({ name: 'B', phone: '2' });
    await useStudentStore.getState().addStudent({ name: 'C', phone: '3' });
    expect(useStudentStore.getState().students).toHaveLength(3);
  });
});
