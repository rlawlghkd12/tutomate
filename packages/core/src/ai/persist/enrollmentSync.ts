/**
 * enrollment 동기화 계산 — 순수 함수 (저장 후 잔액·상태·최근납부일 재계산). 참고: DEV §8 (FR-6).
 * 은행/일반 흐름이 공유할 계산부만 분리(순수) → 단위테스트. 실제 UPDATE는 각 도구가 수행.
 */
import type { PaymentStatusType } from '../../types/index';
import { derivePaymentStatus } from '../../utils/paymentStatus';

export interface EnrollmentSyncRecord {
  paidAt: string;
  amount: number;
}

export interface EnrollmentSyncUpdate {
  paid_amount: number;
  remaining_amount: number;
  /** withdrawn/exempt는 상태를 바꾸지 않으므로 미포함 */
  payment_status?: PaymentStatusType;
  paid_at: string | null;
}

/**
 * @param records 해당 enrollment의 전체 결제(기존 + 이번 저장 합산)
 * @param effectiveFee 수강료 - 할인 (완납 판정 기준)
 * @param currentStatus 현재 납부상태 (withdrawn/exempt면 상태 보존)
 */
export function computeEnrollmentSync(
  records: EnrollmentSyncRecord[],
  effectiveFee: number,
  currentStatus?: string,
): EnrollmentSyncUpdate {
  const totalPaid = records.reduce((a, r) => a + (Number(r.amount) || 0), 0);
  const latestPaidAt = records.reduce((m, r) => (r.paidAt && r.paidAt > m ? r.paidAt : m), '');
  const paidAt = latestPaidAt || null;

  // 포기/면제는 납부액·납부일만 반영하고 상태는 유지
  if (currentStatus === 'withdrawn' || currentStatus === 'exempt') {
    return { paid_amount: totalPaid, remaining_amount: 0, paid_at: paidAt };
  }

  const { paymentStatus, remainingAmount } = derivePaymentStatus(totalPaid, effectiveFee);
  return {
    paid_amount: totalPaid,
    remaining_amount: remainingAmount,
    payment_status: paymentStatus,
    paid_at: paidAt,
  };
}
