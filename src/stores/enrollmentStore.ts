import { create } from 'zustand';
import type { Enrollment, EnrollmentFormData, PaymentMethod } from '../types';
import { isCloud } from './authStore';
import { createDataHelper } from '../utils/dataHelper';
import { mapEnrollmentFromDb, mapEnrollmentToDb, mapEnrollmentUpdateToDb } from '../utils/fieldMapper';
import type { EnrollmentRow } from '../utils/fieldMapper';
import dayjs from 'dayjs';

const helper = createDataHelper<Enrollment, EnrollmentRow>({
  table: 'enrollments',
  fromDb: mapEnrollmentFromDb,
  toDb: mapEnrollmentToDb,
  updateToDb: mapEnrollmentUpdateToDb,
});

interface EnrollmentStore {
  enrollments: Enrollment[];
  loadEnrollments: () => Promise<void>;
  addEnrollment: (enrollmentData: EnrollmentFormData) => Promise<void>;
  updateEnrollment: (id: string, enrollmentData: Partial<Enrollment>) => Promise<void>;
  deleteEnrollment: (id: string) => Promise<void>;
  getEnrollmentById: (id: string) => Enrollment | undefined;
  getEnrollmentsByCourseId: (courseId: string) => Enrollment[];
  getEnrollmentsByStudentId: (studentId: string) => Enrollment[];
  getEnrollmentCountByCourseId: (courseId: string) => number;
  updatePayment: (id: string, paidAmount: number, totalFee: number, paidAt?: string, isExempt?: boolean, paymentMethod?: PaymentMethod, discountAmount?: number) => Promise<void>;
}

export const useEnrollmentStore = create<EnrollmentStore>((set, get) => ({
  enrollments: [],

  loadEnrollments: async () => {
    if (isCloud()) {
      const enrollments = await helper.load();
      set({ enrollments });
    } else {
      const raw = await helper.load();
      // 기존 데이터 호환: discountAmount 없으면 0으로 기본값
      const enrollments = raw.map(e => ({
        ...e,
        discountAmount: e.discountAmount ?? 0,
      }));
      set({ enrollments });
    }
  },

  addEnrollment: async (enrollmentData: EnrollmentFormData) => {
    const remainingAmount = enrollmentData.courseId
      ? 0
      : enrollmentData.paidAmount || 0;

    const newEnrollment: Enrollment = {
      ...enrollmentData,
      id: crypto.randomUUID(),
      enrolledAt: dayjs().toISOString(),
      remainingAmount,
      discountAmount: enrollmentData.discountAmount ?? 0,
    };

    if (isCloud()) {
      await helper.add(newEnrollment);
      set({ enrollments: [...get().enrollments, newEnrollment] });
    } else {
      const enrollments = await helper.add(newEnrollment);
      set({ enrollments });
    }
  },

  updateEnrollment: async (id: string, enrollmentData: Partial<Enrollment>) => {
    if (isCloud()) {
      await helper.update(id, enrollmentData);
      const enrollments = get().enrollments.map((e) =>
        e.id === id ? { ...e, ...enrollmentData } : e,
      );
      set({ enrollments });
    } else {
      const enrollments = await helper.update(id, enrollmentData);
      set({ enrollments });
    }
  },

  deleteEnrollment: async (id: string) => {
    const enrollments = await helper.remove(id, get().enrollments);
    set({ enrollments });
  },

  getEnrollmentById: (id: string) => {
    return get().enrollments.find((enrollment) => enrollment.id === id);
  },

  getEnrollmentsByCourseId: (courseId: string) => {
    return get().enrollments.filter((enrollment) => enrollment.courseId === courseId);
  },

  getEnrollmentsByStudentId: (studentId: string) => {
    return get().enrollments.filter((enrollment) => enrollment.studentId === studentId);
  },

  getEnrollmentCountByCourseId: (courseId: string) => {
    return get().enrollments.filter((enrollment) => enrollment.courseId === courseId).length;
  },

  updatePayment: async (id: string, paidAmount: number, totalFee: number, paidAt?: string, isExempt?: boolean, paymentMethod?: PaymentMethod, discountAmount?: number) => {
    // 할인 적용된 실제 수강료
    const discount = discountAmount ?? get().getEnrollmentById(id)?.discountAmount ?? 0;
    const effectiveFee = totalFee - discount;

    if (isExempt) {
      await get().updateEnrollment(id, {
        paidAmount: 0,
        remainingAmount: 0,
        paymentStatus: 'exempt',
        paidAt: paidAt || dayjs().format('YYYY-MM-DD'),
        ...(paymentMethod !== undefined && { paymentMethod }),
        ...(discountAmount !== undefined && { discountAmount }),
      });
      return;
    }

    const remainingAmount = effectiveFee - paidAmount;
    let paymentStatus: 'pending' | 'partial' | 'completed' = 'pending';

    if (paidAmount === 0) {
      paymentStatus = 'pending';
    } else if (paidAmount < effectiveFee) {
      paymentStatus = 'partial';
    } else {
      paymentStatus = 'completed';
    }

    await get().updateEnrollment(id, {
      paidAmount,
      remainingAmount,
      paymentStatus,
      paidAt: paidAt || dayjs().format('YYYY-MM-DD'),
      ...(paymentMethod !== undefined && { paymentMethod }),
      ...(discountAmount !== undefined && { discountAmount }),
    });
  },
}));
