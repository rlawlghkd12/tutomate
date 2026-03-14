import { create } from 'zustand';
import type { MonthlyPayment, PaymentMethod } from '../types';
import { isCloud } from './authStore';
import { createDataHelper } from '../utils/dataHelper';
import { mapMonthlyPaymentFromDb, mapMonthlyPaymentToDb, mapMonthlyPaymentUpdateToDb } from '../utils/fieldMapper';
import type { MonthlyPaymentRow } from '../utils/fieldMapper';
import dayjs from 'dayjs';

const helper = createDataHelper<MonthlyPayment, MonthlyPaymentRow>({
  table: 'monthly_payments',
  fromDb: mapMonthlyPaymentFromDb,
  toDb: mapMonthlyPaymentToDb,
  updateToDb: mapMonthlyPaymentUpdateToDb,
});

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
    const payments = await helper.load();
    set({ payments });
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
      await helper.add(newPayment);
      set({ payments: [...get().payments, newPayment] });
    } else {
      const payments = await helper.add(newPayment);
      set({ payments });
    }

    return newPayment;
  },

  updatePayment: async (id, updates) => {
    if (isCloud()) {
      await helper.update(id, updates);
      const payments = get().payments.map((p) =>
        p.id === id ? { ...p, ...updates } : p,
      );
      set({ payments });
    } else {
      const payments = await helper.update(id, updates);
      set({ payments });
    }
  },

  deletePayment: async (id) => {
    const payments = await helper.remove(id, get().payments);
    set({ payments });
  },

  deletePaymentsByEnrollmentId: async (enrollmentId) => {
    const toDelete = get().payments.filter((p) => p.enrollmentId === enrollmentId);
    for (const payment of toDelete) {
      await get().deletePayment(payment.id);
    }
  },
}));
