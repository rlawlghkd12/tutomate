import dayjs from "dayjs";
import { create } from "zustand";
import type { PaymentRecord, PaymentMethod } from "../types";
import { createDataHelper } from "../utils/dataHelper";
import type { PaymentRecordRow } from "../utils/fieldMapper";
import {
  mapPaymentRecordFromDb,
  mapPaymentRecordToDb,
  mapPaymentRecordUpdateToDb,
} from "../utils/fieldMapper";
import { useEnrollmentStore } from "./enrollmentStore";
import { handleError, showErrorMessage } from "../utils/errors";
import { logError } from "../utils/logger";

const helper = createDataHelper<PaymentRecord, PaymentRecordRow>({
  table: "payment_records",
  fromDb: mapPaymentRecordFromDb,
  toDb: mapPaymentRecordToDb,
  updateToDb: mapPaymentRecordUpdateToDb,
});

interface PaymentRecordStore {
  records: PaymentRecord[];
  loadRecords: () => Promise<void>;
  invalidate: () => void;
  getRecordsByEnrollmentId: (enrollmentId: string) => PaymentRecord[];
  addPayment: (
    enrollmentId: string,
    amount: number,
    courseFee: number,
    paymentMethod?: PaymentMethod,
    paidAt?: string,
    notes?: string,
  ) => Promise<PaymentRecord | null>;
  updateRecord: (id: string, updates: Partial<PaymentRecord>) => Promise<boolean>;
  deletePayment: (id: string, courseFee: number) => Promise<boolean>;
  deletePaymentsByEnrollmentId: (enrollmentId: string) => Promise<void>;
}

export const usePaymentRecordStore = create<PaymentRecordStore>(
  (set, get) => ({
    records: [],

    loadRecords: async () => {
      const result = await helper.load();
      if (result.status === 'ok' || result.status === 'cached') {
        set({ records: result.data });
      }
      if (result.status === 'cached') {
        showErrorMessage('오프라인 상태입니다. 저장된 데이터를 표시합니다.');
      }
      if (result.status === 'error') {
        handleError(result.error);
      }
    },

    invalidate: () => helper.invalidate(),

    getRecordsByEnrollmentId: (enrollmentId: string) => {
      return get()
        .records.filter((r) => r.enrollmentId === enrollmentId)
        .sort((a, b) => (b.paidAt || "").localeCompare(a.paidAt || ""));
    },

    addPayment: async (
      enrollmentId,
      amount,
      courseFee,
      paymentMethod?,
      paidAt?,
      notes?,
    ) => {
      const newRecord: PaymentRecord = {
        id: crypto.randomUUID(),
        enrollmentId,
        amount,
        paidAt: paidAt || dayjs().format("YYYY-MM-DD"),
        paymentMethod,
        notes,
        createdAt: dayjs().toISOString(),
      };
      const error = await helper.add(newRecord);
      if (error) {
        handleError(error);
        return null;
      }
      set({ records: [...get().records, newRecord] });
      await syncEnrollmentTotal(enrollmentId, courseFee, get().records);
      return newRecord;
    },

    updateRecord: async (id, updates) => {
      const error = await helper.update(id, updates);
      if (error) {
        handleError(error);
        return false;
      }
      set({
        records: get().records.map((r) => r.id === id ? { ...r, ...updates } : r),
      });
      return true;
    },

    deletePayment: async (id, courseFee) => {
      const record = get().records.find((r) => r.id === id);
      if (!record) return false;

      const error = await helper.remove(id);
      if (error) {
        handleError(error);
        return false;
      }
      const filtered = get().records.filter((r) => r.id !== id);
      set({ records: filtered });
      await syncEnrollmentTotal(record.enrollmentId, courseFee, filtered);
      return true;
    },

    deletePaymentsByEnrollmentId: async (enrollmentId) => {
      const toDelete = get().records.filter((r) => r.enrollmentId === enrollmentId);
      const deletedIds: string[] = [];
      for (const record of toDelete) {
        const error = await helper.remove(record.id);
        if (error) {
          logError(`Failed to delete payment record ${record.id}`, { error });
        } else {
          deletedIds.push(record.id);
        }
      }
      if (deletedIds.length > 0) {
        set({
          records: get().records.filter((r) => !deletedIds.includes(r.id)),
        });
      }
    },
  }),
);

/** payment_records 합산 → enrollment paidAmount/status 갱신 */
async function syncEnrollmentTotal(
  enrollmentId: string,
  courseFee: number,
  allRecords: PaymentRecord[],
) {
  const enrollmentRecords = allRecords.filter(
    (r) => r.enrollmentId === enrollmentId,
  );
  const totalPaid = enrollmentRecords.reduce((sum, r) => sum + r.amount, 0);
  const latestRecord = enrollmentRecords.sort((a, b) =>
    (b.paidAt || "").localeCompare(a.paidAt || ""),
  )[0];

  const enrollment = useEnrollmentStore.getState().getEnrollmentById(enrollmentId);
  if (!enrollment) return;
  if (enrollment.paymentStatus === 'withdrawn') return;

  const discount = enrollment.discountAmount ?? 0;

  await useEnrollmentStore.getState().updatePayment(
    enrollmentId,
    totalPaid,
    courseFee,
    latestRecord?.paidAt,
    false,
    latestRecord?.paymentMethod,
    discount,
  );
}
