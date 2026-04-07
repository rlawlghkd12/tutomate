import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock all store dependencies
const mockCourseInvalidate = vi.fn();
const mockCourseLoadCourses = vi.fn().mockResolvedValue(undefined);
const mockStudentInvalidate = vi.fn();
const mockStudentLoadStudents = vi.fn().mockResolvedValue(undefined);
const mockEnrollmentInvalidate = vi.fn();
const mockEnrollmentLoadEnrollments = vi.fn().mockResolvedValue(undefined);
const mockMonthlyPaymentInvalidate = vi.fn();
const mockMonthlyPaymentLoadPayments = vi.fn().mockResolvedValue(undefined);
const mockPaymentRecordInvalidate = vi.fn();
const mockPaymentRecordLoadRecords = vi.fn().mockResolvedValue(undefined);

vi.mock('../courseStore', () => ({
  useCourseStore: {
    getState: () => ({
      invalidate: mockCourseInvalidate,
      loadCourses: mockCourseLoadCourses,
    }),
    setState: vi.fn(),
  },
}));

vi.mock('../studentStore', () => ({
  useStudentStore: {
    getState: () => ({
      invalidate: mockStudentInvalidate,
      loadStudents: mockStudentLoadStudents,
    }),
    setState: vi.fn(),
  },
}));

vi.mock('../enrollmentStore', () => ({
  useEnrollmentStore: {
    getState: () => ({
      invalidate: mockEnrollmentInvalidate,
      loadEnrollments: mockEnrollmentLoadEnrollments,
    }),
    setState: vi.fn(),
  },
}));

vi.mock('../monthlyPaymentStore', () => ({
  useMonthlyPaymentStore: {
    getState: () => ({
      invalidate: mockMonthlyPaymentInvalidate,
      loadPayments: mockMonthlyPaymentLoadPayments,
    }),
    setState: vi.fn(),
  },
}));

vi.mock('../paymentRecordStore', () => ({
  usePaymentRecordStore: {
    getState: () => ({
      invalidate: mockPaymentRecordInvalidate,
      loadRecords: mockPaymentRecordLoadRecords,
    }),
    setState: vi.fn(),
  },
}));

vi.mock('../../utils/dataHelper', () => ({
  clearAllCache: vi.fn().mockResolvedValue(undefined),
}));

import { reloadAllStores } from '../reloadStores';
import { clearAllCache } from '../../utils/dataHelper';
import { useCourseStore } from '../courseStore';
import { useStudentStore } from '../studentStore';
import { useEnrollmentStore } from '../enrollmentStore';
import { useMonthlyPaymentStore } from '../monthlyPaymentStore';
import { usePaymentRecordStore } from '../paymentRecordStore';

describe('reloadStores', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reloadAllStores - clearAllCache, invalidate, setState, load 순서로 호출', async () => {
    await reloadAllStores();

    // 1. clearAllCache 호출
    expect(clearAllCache).toHaveBeenCalled();

    // 2. 모든 store invalidate 호출
    expect(mockCourseInvalidate).toHaveBeenCalled();
    expect(mockStudentInvalidate).toHaveBeenCalled();
    expect(mockEnrollmentInvalidate).toHaveBeenCalled();
    expect(mockMonthlyPaymentInvalidate).toHaveBeenCalled();
    expect(mockPaymentRecordInvalidate).toHaveBeenCalled();

    // 3. 모든 store setState 호출 (빈 배열로 리셋)
    expect(useCourseStore.setState).toHaveBeenCalledWith({ courses: [] });
    expect(useStudentStore.setState).toHaveBeenCalledWith({ students: [] });
    expect(useEnrollmentStore.setState).toHaveBeenCalledWith({ enrollments: [] });
    expect(useMonthlyPaymentStore.setState).toHaveBeenCalledWith({ payments: [] });
    expect(usePaymentRecordStore.setState).toHaveBeenCalledWith({ records: [] });

    // 4. 모든 store load 호출
    expect(mockCourseLoadCourses).toHaveBeenCalled();
    expect(mockStudentLoadStudents).toHaveBeenCalled();
    expect(mockEnrollmentLoadEnrollments).toHaveBeenCalled();
    expect(mockMonthlyPaymentLoadPayments).toHaveBeenCalled();
    expect(mockPaymentRecordLoadRecords).toHaveBeenCalled();
  });
});
