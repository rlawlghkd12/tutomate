/**
 * 납부 상태·잔여액을 계산하는 단일 기준 (완납/부분납부/미납 판정).
 *
 * 이전엔 이 동일한 공식이 세 곳에 각각 하드코딩돼 있었다:
 *   - enrollmentStore.updatePayment (일반 저장 경로)
 *   - computeEnrollmentSync         (AI 임포트 경로)
 *   - confirmBankDeposits           (은행 대조 신규등록)
 * → 한 곳으로 통합해 "완납 기준"을 바꿀 때 한 군데만 고치면 되도록 한다.
 *
 * 주의: withdrawn(포기)·exempt(면제) 같은 특수 상태 '보존'은 호출부 책임이다.
 * 이 함수는 순수하게 납부액 대비 상태/잔여만 계산한다.
 */
import { PaymentStatus } from '../types/index';

export interface PaymentDerivation {
  paymentStatus: 'pending' | 'partial' | 'completed';
  remainingAmount: number;
}

/**
 * @param paidAmount   납부액 합계
 * @param effectiveFee 실수강료 (수강료 - 할인). 완납 판정 기준.
 */
export function derivePaymentStatus(
  paidAmount: number,
  effectiveFee: number,
): PaymentDerivation {
  const remainingAmount = Math.max(0, effectiveFee - paidAmount);
  const paymentStatus =
    paidAmount <= 0
      ? PaymentStatus.PENDING
      : paidAmount < effectiveFee
        ? PaymentStatus.PARTIAL
        : PaymentStatus.COMPLETED;
  return { paymentStatus, remainingAmount };
}
