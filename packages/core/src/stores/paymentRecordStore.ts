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
import { useStudentStore } from "./studentStore";
import { useCourseStore } from "./courseStore";
import { handleError, showErrorMessage } from "../utils/errors";
import { logError } from "../utils/logger";
import { logEvent } from "../utils/eventLogger";

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
        .sort(byLatest);
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

      // 감사 로그: 환불(음수)과 일반 결제를 구분
      const enrollment = useEnrollmentStore.getState().getEnrollmentById(enrollmentId);
      const student = enrollment ? useStudentStore.getState().getStudentById(enrollment.studentId) : undefined;
      const course = enrollment ? useCourseStore.getState().getCourseById(enrollment.courseId) : undefined;
      await logEvent({
        eventType: amount < 0 ? 'payment.refund' : 'payment.add',
        entityType: 'payment_record',
        entityId: newRecord.id,
        entityLabel: student && course ? `${student.name} — ${course.name}` : undefined,
        after: {
          amount: newRecord.amount,
          paidAt: newRecord.paidAt,
          paymentMethod: newRecord.paymentMethod,
          notes: newRecord.notes,
        },
        meta: { enrollmentId },
      });
      return newRecord;
    },

    updateRecord: async (id, updates) => {
      const before = get().records.find((r) => r.id === id);
      const error = await helper.update(id, updates);
      if (error) {
        handleError(error);
        return false;
      }
      set({
        records: get().records.map((r) => r.id === id ? { ...r, ...updates } : r),
      });
      if (before) {
        const enrollment = useEnrollmentStore.getState().getEnrollmentById(before.enrollmentId);
        const course = enrollment ? useCourseStore.getState().getCourseById(enrollment.courseId) : undefined;
        if (course) {
          await syncEnrollmentTotal(before.enrollmentId, course.fee, get().records);
        }
        await logEvent({
          eventType: 'payment.update',
          entityType: 'payment_record',
          entityId: id,
          before: {
            amount: before.amount,
            paidAt: before.paidAt,
            paymentMethod: before.paymentMethod,
            notes: before.notes,
          },
          after: updates,
          meta: { enrollmentId: before.enrollmentId },
        });
      }
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
      await logEvent({
        eventType: 'payment.delete',
        entityType: 'payment_record',
        entityId: id,
        before: {
          amount: record.amount,
          paidAt: record.paidAt,
          paymentMethod: record.paymentMethod,
          notes: record.notes,
        },
        meta: { enrollmentId: record.enrollmentId },
      });
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
        await logEvent({
          eventType: 'payment.bulk_delete',
          entityType: 'payment_record',
          entityId: null,
          meta: {
            enrollmentId,
            deletedCount: deletedIds.length,
            deletedAmounts: toDelete
              .filter((r) => deletedIds.includes(r.id))
              .map((r) => r.amount),
          },
        });
      }
    },
  }),
);

/**
 * 최신 납부 순 정렬: 납부일(paidAt)이 늦은 것 먼저, 같은 날이면 나중에 입력한 것(createdAt) 먼저.
 * 같은 납부일로 다시 입력한 기록(예: 현금 → 계좌이체 재입력)이 예전 기록에 밀리지 않게 한다.
 */
function byLatest(a: PaymentRecord, b: PaymentRecord): number {
  const byPaidAt = (b.paidAt || "").localeCompare(a.paidAt || "");
  if (byPaidAt !== 0) return byPaidAt;
  return (Date.parse(b.createdAt || "") || 0) - (Date.parse(a.createdAt || "") || 0);
}

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
  const latestRecord = [...enrollmentRecords].sort(byLatest)[0];

  const enrollment = useEnrollmentStore.getState().getEnrollmentById(enrollmentId);
  if (!enrollment) return;

  // withdrawn: 상태는 유지하되 paidAmount는 환불 반영하여 동기화
  // (수익 집계는 enrollment.paidAmount를 source of truth로 사용)
  if (enrollment.paymentStatus === 'withdrawn') {
    await useEnrollmentStore.getState().updateEnrollment(enrollmentId, {
      paidAmount: totalPaid,
      remainingAmount: 0,
      paidAt: latestRecord?.paidAt,
    });
    return;
  }

  const isExempt = enrollment.paymentStatus === 'exempt';
  const discount = enrollment.discountAmount ?? 0;

  // 환불(amount<0)이 섞여 있을 때 paymentMethod 보호:
  // 양수 record 중 가장 최근 것을 우선 사용 (없으면 latestRecord 사용)
  const positiveRecords = enrollmentRecords.filter((r) => r.amount > 0);
  const latestPositive = positiveRecords.sort(byLatest)[0];
  const effectiveMethod = latestPositive?.paymentMethod ?? latestRecord?.paymentMethod;

  await useEnrollmentStore.getState().updatePayment(
    enrollmentId,
    totalPaid,
    courseFee,
    latestRecord?.paidAt,
    isExempt,
    effectiveMethod,
    discount,
  );
}
