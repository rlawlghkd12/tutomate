import { create } from 'zustand';
import type { Enrollment, EnrollmentFormData } from '../types';
import {
  addToStorage,
  updateInStorage,
  deleteFromStorage,
  loadData,
  STORAGE_KEYS,
} from '../utils/storage';
import { isCloud, getOrgId } from './authStore';
import { supabaseLoadData, supabaseInsert, supabaseUpdate, supabaseDelete } from '../utils/supabaseStorage';
import { mapEnrollmentFromDb, mapEnrollmentToDb, mapEnrollmentUpdateToDb } from '../utils/fieldMapper';
import type { EnrollmentRow } from '../utils/fieldMapper';
import { logError } from '../utils/logger';
import dayjs from 'dayjs';

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
  updatePayment: (id: string, paidAmount: number, totalFee: number, paidAt?: string, isExempt?: boolean) => Promise<void>;
}

export const useEnrollmentStore = create<EnrollmentStore>((set, get) => ({
  enrollments: [],

  loadEnrollments: async () => {
    if (isCloud()) {
      try {
        const rows = await supabaseLoadData<EnrollmentRow>('enrollments');
        set({ enrollments: rows.map(mapEnrollmentFromDb) });
      } catch (error) {
        logError('Failed to load enrollments from cloud', { error });
      }
    } else {
      const enrollments = await loadData<Enrollment>(STORAGE_KEYS.ENROLLMENTS);
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
    };

    if (isCloud()) {
      const orgId = getOrgId();
      if (!orgId) return;
      try {
        await supabaseInsert('enrollments', mapEnrollmentToDb(newEnrollment, orgId));
        set({ enrollments: [...get().enrollments, newEnrollment] });
      } catch (error) {
        logError('Failed to add enrollment to cloud', { error });
      }
    } else {
      const enrollments = addToStorage(STORAGE_KEYS.ENROLLMENTS, newEnrollment);
      set({ enrollments });
    }
  },

  updateEnrollment: async (id: string, enrollmentData: Partial<Enrollment>) => {
    if (isCloud()) {
      try {
        await supabaseUpdate('enrollments', id, mapEnrollmentUpdateToDb(enrollmentData));
        const enrollments = get().enrollments.map((e) =>
          e.id === id ? { ...e, ...enrollmentData } : e,
        );
        set({ enrollments });
      } catch (error) {
        logError('Failed to update enrollment in cloud', { error });
      }
    } else {
      const enrollments = updateInStorage(STORAGE_KEYS.ENROLLMENTS, id, enrollmentData);
      set({ enrollments });
    }
  },

  deleteEnrollment: async (id: string) => {
    if (isCloud()) {
      try {
        await supabaseDelete('enrollments', id);
        set({ enrollments: get().enrollments.filter((e) => e.id !== id) });
      } catch (error) {
        logError('Failed to delete enrollment from cloud', { error });
      }
    } else {
      const enrollments = deleteFromStorage<Enrollment>(STORAGE_KEYS.ENROLLMENTS, id);
      set({ enrollments });
    }
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

  getEnrollmentCountByCourseId: (courseId: string) => {
    const { enrollments } = get();
    return enrollments.filter((enrollment) => enrollment.courseId === courseId).length;
  },

  updatePayment: async (id: string, paidAmount: number, totalFee: number, paidAt?: string, isExempt?: boolean) => {
    if (isExempt) {
      await get().updateEnrollment(id, {
        paidAmount: 0,
        remainingAmount: 0,
        paymentStatus: 'exempt',
        paidAt: paidAt || dayjs().format('YYYY-MM-DD'),
      });
      return;
    }

    const remainingAmount = totalFee - paidAmount;
    let paymentStatus: 'pending' | 'partial' | 'completed' = 'pending';

    if (paidAmount === 0) {
      paymentStatus = 'pending';
    } else if (paidAmount < totalFee) {
      paymentStatus = 'partial';
    } else {
      paymentStatus = 'completed';
    }

    await get().updateEnrollment(id, {
      paidAmount,
      remainingAmount,
      paymentStatus,
      paidAt: paidAt || dayjs().format('YYYY-MM-DD'),
    });
  },
}));
