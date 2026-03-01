import { create } from 'zustand';
import type { MonthlyPayment, PaymentMethod } from '../types';
import {
  addToStorage,
  updateInStorage,
  deleteFromStorage,
  loadData,
  STORAGE_KEYS,
} from '../utils/storage';
import { isCloud, getOrgId } from './authStore';
import { supabaseLoadData, supabaseInsert, supabaseUpdate, supabaseDelete } from '../utils/supabaseStorage';
import { mapMonthlyPaymentFromDb, mapMonthlyPaymentToDb, mapMonthlyPaymentUpdateToDb } from '../utils/fieldMapper';
import type { MonthlyPaymentRow } from '../utils/fieldMapper';
import { logError } from '../utils/logger';
import dayjs from 'dayjs';

interface MonthlyPaymentStore {
  payments: MonthlyPayment[];
  loadPayments: () => Promise<void>;
  getPaymentsByEnrollmentId: (enrollmentId: string) => MonthlyPayment[];
  getPaymentsByMonth: (month: string) => MonthlyPayment[];
  addPayment: (enrollmentId: string, month: string, amount: number, paymentMethod?: PaymentMethod, paidAt?: string, notes?: string) => Promise<MonthlyPayment>;
  updatePayment: (id: string, updates: Partial<MonthlyPayment>) => Promise<void>;
  deletePayment: (id: string) => Promise<void>;
  deletePaymentsByEnrollmentId: (enrollmentId: string) => Promise<void>;
}

export const useMonthlyPaymentStore = create<MonthlyPaymentStore>((set, get) => ({
  payments: [],

  loadPayments: async () => {
    if (isCloud()) {
      try {
        const rows = await supabaseLoadData<MonthlyPaymentRow>('monthly_payments');
        set({ payments: rows.map(mapMonthlyPaymentFromDb) });
      } catch (error) {
        logError('Failed to load monthly payments from cloud', { error });
      }
    } else {
      const payments = await loadData<MonthlyPayment>(STORAGE_KEYS.MONTHLY_PAYMENTS);
      set({ payments });
    }
  },

  getPaymentsByEnrollmentId: (enrollmentId: string) => {
    return get().payments
      .filter((p) => p.enrollmentId === enrollmentId)
      .sort((a, b) => a.month.localeCompare(b.month));
  },

  getPaymentsByMonth: (month: string) => {
    return get().payments.filter((p) => p.month === month);
  },

  addPayment: async (enrollmentId, month, amount, paymentMethod?, paidAt?, notes?) => {
    const newPayment: MonthlyPayment = {
      id: crypto.randomUUID(),
      enrollmentId,
      month,
      amount,
      paidAt: paidAt || (amount > 0 ? dayjs().format('YYYY-MM-DD') : undefined),
      paymentMethod,
      status: amount > 0 ? 'paid' : 'pending',
      notes,
      createdAt: dayjs().toISOString(),
    };

    if (isCloud()) {
      const orgId = getOrgId();
      if (!orgId) return newPayment;
      try {
        await supabaseInsert('monthly_payments', mapMonthlyPaymentToDb(newPayment, orgId));
        set({ payments: [...get().payments, newPayment] });
      } catch (error) {
        logError('Failed to add monthly payment to cloud', { error });
      }
    } else {
      const payments = addToStorage(STORAGE_KEYS.MONTHLY_PAYMENTS, newPayment);
      set({ payments });
    }

    return newPayment;
  },

  updatePayment: async (id, updates) => {
    if (isCloud()) {
      try {
        await supabaseUpdate('monthly_payments', id, mapMonthlyPaymentUpdateToDb(updates));
        const payments = get().payments.map((p) =>
          p.id === id ? { ...p, ...updates } : p,
        );
        set({ payments });
      } catch (error) {
        logError('Failed to update monthly payment in cloud', { error });
      }
    } else {
      const payments = updateInStorage(STORAGE_KEYS.MONTHLY_PAYMENTS, id, updates);
      set({ payments });
    }
  },

  deletePayment: async (id) => {
    if (isCloud()) {
      try {
        await supabaseDelete('monthly_payments', id);
        set({ payments: get().payments.filter((p) => p.id !== id) });
      } catch (error) {
        logError('Failed to delete monthly payment from cloud', { error });
      }
    } else {
      const payments = deleteFromStorage<MonthlyPayment>(STORAGE_KEYS.MONTHLY_PAYMENTS, id);
      set({ payments });
    }
  },

  deletePaymentsByEnrollmentId: async (enrollmentId) => {
    const toDelete = get().payments.filter((p) => p.enrollmentId === enrollmentId);
    for (const payment of toDelete) {
      await get().deletePayment(payment.id);
    }
  },
}));
