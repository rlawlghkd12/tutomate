import { create } from 'zustand';
import type { Enrollment, EnrollmentFormData } from '../types';
import {
  addToStorage,
  updateInStorage,
  deleteFromStorage,
  loadData,
  STORAGE_KEYS,
} from '../utils/storage';
import dayjs from 'dayjs';

interface EnrollmentStore {
  enrollments: Enrollment[];
  loadEnrollments: () => Promise<void>;
  addEnrollment: (enrollmentData: EnrollmentFormData) => void;
  updateEnrollment: (id: string, enrollmentData: Partial<Enrollment>) => void;
  deleteEnrollment: (id: string) => void;
  getEnrollmentById: (id: string) => Enrollment | undefined;
  getEnrollmentsByCourseId: (courseId: string) => Enrollment[];
  getEnrollmentsByStudentId: (studentId: string) => Enrollment[];
  updatePayment: (id: string, paidAmount: number, totalFee: number) => void;
}

export const useEnrollmentStore = create<EnrollmentStore>((set, get) => ({
  enrollments: [],

  loadEnrollments: async () => {
    const enrollments = await loadData<Enrollment>(STORAGE_KEYS.ENROLLMENTS);
    set({ enrollments });
  },

  addEnrollment: (enrollmentData: EnrollmentFormData) => {
    const remainingAmount = enrollmentData.courseId
      ? 0
      : enrollmentData.paidAmount || 0;

    const newEnrollment: Enrollment = {
      ...enrollmentData,
      id: crypto.randomUUID(),
      enrolledAt: dayjs().toISOString(),
      remainingAmount,
    };
    const enrollments = addToStorage(STORAGE_KEYS.ENROLLMENTS, newEnrollment);
    set({ enrollments });
  },

  updateEnrollment: (id: string, enrollmentData: Partial<Enrollment>) => {
    const enrollments = updateInStorage(STORAGE_KEYS.ENROLLMENTS, id, enrollmentData);
    set({ enrollments });
  },

  deleteEnrollment: (id: string) => {
    const enrollments = deleteFromStorage<Enrollment>(STORAGE_KEYS.ENROLLMENTS, id);
    set({ enrollments });
  },

  getEnrollmentById: (id: string) => {
    const { enrollments } = get();
    return enrollments.find((enrollment) => enrollment.id === id);
  },

  getEnrollmentsByCourseId: (courseId: string) => {
    const { enrollments } = get();
    return enrollments.filter((enrollment) => enrollment.courseId === courseId);
  },

  getEnrollmentsByStudentId: (studentId: string) => {
    const { enrollments } = get();
    return enrollments.filter((enrollment) => enrollment.studentId === studentId);
  },

  updatePayment: (id: string, paidAmount: number, totalFee: number) => {
    const remainingAmount = totalFee - paidAmount;
    let paymentStatus: 'pending' | 'partial' | 'completed' = 'pending';

    if (paidAmount === 0) {
      paymentStatus = 'pending';
    } else if (paidAmount < totalFee) {
      paymentStatus = 'partial';
    } else {
      paymentStatus = 'completed';
    }

    get().updateEnrollment(id, {
      paidAmount,
      remainingAmount,
      paymentStatus,
    });
  },
}));
