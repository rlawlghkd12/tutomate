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
  ) => Promise<PaymentRecord>;
  updateRecord: (id: string, updates: Partial<PaymentRecord>) => Promise<void>;
  deletePayment: (id: string, courseFee: number) => Promise<void>;
  deletePaymentsByEnrollmentId: (enrollmentId: string) => Promise<void>;
}

export const usePaymentRecordStore = create<PaymentRecordStore>(
  (set, get) => ({
    records: [],

    loadRecords: async () => {
      try {
        const records = await helper.load();
        set({ records });
      } catch {
        // 로드 실패 시 기존 데이터 유지
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

      try {
        await helper.add(newRecord);
      } catch {
        // 서버 저장 실패 — 로컬에만 추가
      }
      set({ records: [...get().records, newRecord] });

      // enrollment 합산 갱신
      await syncEnrollmentTotal(enrollmentId, courseFee, get().records);

      return newRecord;
    },

    updateRecord: async (id, updates) => {
      try {
        await helper.update(id, updates);
      } catch {
        // 서버 저장 실패해도 로컬 state는 유지
      }
      const records = get().records.map((r) =>
        r.id === id ? { ...r, ...updates } : r,
      );
      set({ records });
    },

    deletePayment: async (id, courseFee) => {
      const record = get().records.find((r) => r.id === id);
      if (!record) return;

      // 로컬 먼저 반영
      const filtered = get().records.filter((r) => r.id !== id);
      set({ records: filtered });

      try {
        await helper.remove(id, get().records);
      } catch {
        // 서버 삭제 실패해도 로컬은 이미 반영됨
      }

      const records = filtered;

      // enrollment 합산 갱신
      await syncEnrollmentTotal(record.enrollmentId, courseFee, records);
    },

    deletePaymentsByEnrollmentId: async (enrollmentId) => {
      const toDelete = get().records.filter(
        (r) => r.enrollmentId === enrollmentId,
      );
      for (const record of toDelete) {
        await helper.remove(record.id, get().records);
      }
      set({
        records: get().records.filter((r) => r.enrollmentId !== enrollmentId),
      });
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
