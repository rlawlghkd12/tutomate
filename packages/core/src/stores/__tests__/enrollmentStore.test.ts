import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock authStore
vi.mock('../authStore', () => ({
  isCloud: () => true,
  getOrgId: () => 'test-org-id',
}));

// Mock supabase client
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

// Mock logger
vi.mock('../../utils/logger', () => ({
  logError: vi.fn(),
  logWarn: vi.fn(),
  logInfo: vi.fn(),
  logDebug: vi.fn(),
}));

import { useEnrollmentStore } from '../enrollmentStore';
import type { Enrollment } from '../../types';

function makeEnrollment(overrides: Partial<Enrollment> = {}): Enrollment {
  return {
    id: 'e1',
    courseId: 'c1',
    studentId: 's1',
    enrolledAt: '2026-03-01T00:00:00Z',
    paymentStatus: 'pending',
    paidAmount: 0,
    remainingAmount: 300000,
    discountAmount: 0,
    ...overrides,
  };
}

describe('enrollmentStore — updatePayment 결제 로직', () => {
  beforeEach(() => {
    useEnrollmentStore.setState({ enrollments: [makeEnrollment()] });
  });

  it('전액 납부 → completed, remainingAmount: 0', async () => {
    await useEnrollmentStore.getState().updatePayment('e1', 300000, 300000);
    const e = useEnrollmentStore.getState().getEnrollmentById('e1')!;
    expect(e.paymentStatus).toBe('completed');
    expect(e.remainingAmount).toBe(0);
    expect(e.paidAmount).toBe(300000);
  });

  it('부분 납부 → partial, 잔액 계산', async () => {
    await useEnrollmentStore.getState().updatePayment('e1', 100000, 300000);
    const e = useEnrollmentStore.getState().getEnrollmentById('e1')!;
    expect(e.paymentStatus).toBe('partial');
    expect(e.remainingAmount).toBe(200000);
  });

  it('미납 → pending', async () => {
    await useEnrollmentStore.getState().updatePayment('e1', 0, 300000);
    const e = useEnrollmentStore.getState().getEnrollmentById('e1')!;
    expect(e.paymentStatus).toBe('pending');
    expect(e.remainingAmount).toBe(300000);
  });

  it('면제 → exempt, paidAmount: 0, remainingAmount: 0', async () => {
    await useEnrollmentStore.getState().updatePayment('e1', 0, 300000, undefined, true);
    const e = useEnrollmentStore.getState().getEnrollmentById('e1')!;
    expect(e.paymentStatus).toBe('exempt');
    expect(e.paidAmount).toBe(0);
    expect(e.remainingAmount).toBe(0);
  });

  it('할인 적용 — effectiveFee 기준 계산', async () => {
    await useEnrollmentStore.getState().updatePayment('e1', 250000, 300000, undefined, false, undefined, 50000);
    const e = useEnrollmentStore.getState().getEnrollmentById('e1')!;
    // effectiveFee = 300000 - 50000 = 250000
    expect(e.paymentStatus).toBe('completed');
    expect(e.remainingAmount).toBe(0);
  });

  it('할인 + 부분 납부', async () => {
    await useEnrollmentStore.getState().updatePayment('e1', 100000, 300000, undefined, false, undefined, 50000);
    const e = useEnrollmentStore.getState().getEnrollmentById('e1')!;
    // effectiveFee = 250000, paid = 100000
    expect(e.paymentStatus).toBe('partial');
    expect(e.remainingAmount).toBe(150000);
  });

  it('기존 할인 유지 — discountAmount 미전달 시 enrollment의 기존값 사용', async () => {
    useEnrollmentStore.setState({ enrollments: [makeEnrollment({ discountAmount: 30000 })] });
    await useEnrollmentStore.getState().updatePayment('e1', 270000, 300000);
    const e = useEnrollmentStore.getState().getEnrollmentById('e1')!;
    // effectiveFee = 300000 - 30000 = 270000, paid = 270000
    expect(e.paymentStatus).toBe('completed');
    expect(e.remainingAmount).toBe(0);
  });

  it('결제 방법 전달 시 업데이트에 포함', async () => {
    await useEnrollmentStore.getState().updatePayment('e1', 300000, 300000, undefined, false, 'card');
    const e = useEnrollmentStore.getState().getEnrollmentById('e1')!;
    expect(e.paymentMethod).toBe('card');
  });

  it('납부일 미전달 시 오늘 날짜 사용', async () => {
    const { default: dayjs } = await import('dayjs');
    const today = dayjs().format('YYYY-MM-DD');
    await useEnrollmentStore.getState().updatePayment('e1', 300000, 300000);
    const e = useEnrollmentStore.getState().getEnrollmentById('e1')!;
    expect(e.paidAt).toBe(today);
  });

  it('납부일 직접 지정', async () => {
    await useEnrollmentStore.getState().updatePayment('e1', 300000, 300000, '2026-02-15');
    const e = useEnrollmentStore.getState().getEnrollmentById('e1')!;
    expect(e.paidAt).toBe('2026-02-15');
  });
});

describe('enrollmentStore — CRUD', () => {
  beforeEach(() => {
    useEnrollmentStore.setState({ enrollments: [] });
  });

  it('addEnrollment → state에 추가, discountAmount 기본값 0', async () => {
    await useEnrollmentStore.getState().addEnrollment({
      courseId: 'c1', studentId: 's1', paymentStatus: 'pending',
      paidAmount: 0, discountAmount: 0,
    } as any);
    const enrollments = useEnrollmentStore.getState().enrollments;
    expect(enrollments).toHaveLength(1);
    expect(enrollments[0].discountAmount).toBe(0);
    expect(enrollments[0].id).toBeTruthy();
    expect(enrollments[0].enrolledAt).toBeTruthy();
  });

  it('updateEnrollment → 부분 업데이트', async () => {
    useEnrollmentStore.setState({ enrollments: [makeEnrollment()] });
    await useEnrollmentStore.getState().updateEnrollment('e1', { notes: '변경됨' });
    const e = useEnrollmentStore.getState().getEnrollmentById('e1')!;
    expect(e.notes).toBe('변경됨');
    expect(e.courseId).toBe('c1'); // 다른 필드 변경 없음
  });

  it('getEnrollmentsByCourseId — 필터링', () => {
    useEnrollmentStore.setState({
      enrollments: [
        makeEnrollment({ id: 'e1', courseId: 'c1' }),
        makeEnrollment({ id: 'e2', courseId: 'c2' }),
        makeEnrollment({ id: 'e3', courseId: 'c1' }),
      ],
    });
    expect(useEnrollmentStore.getState().getEnrollmentsByCourseId('c1')).toHaveLength(2);
    expect(useEnrollmentStore.getState().getEnrollmentsByCourseId('c2')).toHaveLength(1);
  });

  it('getEnrollmentsByStudentId — 필터링', () => {
    useEnrollmentStore.setState({
      enrollments: [
        makeEnrollment({ id: 'e1', studentId: 's1' }),
        makeEnrollment({ id: 'e2', studentId: 's2' }),
      ],
    });
    expect(useEnrollmentStore.getState().getEnrollmentsByStudentId('s1')).toHaveLength(1);
  });

  it('getEnrollmentCountByCourseId', () => {
    useEnrollmentStore.setState({
      enrollments: [
        makeEnrollment({ id: 'e1', courseId: 'c1' }),
        makeEnrollment({ id: 'e2', courseId: 'c1' }),
      ],
    });
    expect(useEnrollmentStore.getState().getEnrollmentCountByCourseId('c1')).toBe(2);
    expect(useEnrollmentStore.getState().getEnrollmentCountByCourseId('c99')).toBe(0);
  });
});
