/**
 * 납부정보 '변경' 시 결제 이력(payment_records)을 어떻게 반영할지 결정하는 순수 함수.
 *
 * 문제: 납부정보를 바꾸면 기존 기록이 수정되지 않고 이력에 '새 줄'이 추가되던 경우가 있었다.
 * 방침(사용자 확정): "기존 기록 수정으로 통일". 분납(여러 번 나눠 냄)은 명시적 '납부 추가'로만.
 *
 * 규칙:
 *   - 새 금액이 0 이하(면제/취소) → 이력 손대지 않고 요약만 갱신(summaryOnly)
 *   - 기존 양수 결제 기록 0건        → 새로 만든다(create)            [첫 납부]
 *   - 정확히 1건                     → 그 기록을 수정(update)          [변경이 추가로 새지 않게]
 *   - 2건 이상(분납)                 → 어느 건인지 모호 → 요약만(summaryOnly)
 */

export interface LedgerRecordLite {
  id: string;
  amount: number;
}

export type PaymentEditOp =
  | { kind: 'create' }
  | { kind: 'update'; recordId: string }
  | { kind: 'summaryOnly' };

export function decidePaymentEdit(
  existingRecords: LedgerRecordLite[],
  nextAmount: number,
): PaymentEditOp {
  if (!(nextAmount > 0)) return { kind: 'summaryOnly' };
  const positive = existingRecords.filter((r) => r.amount > 0);
  if (positive.length === 0) return { kind: 'create' };
  if (positive.length === 1) return { kind: 'update', recordId: positive[0].id };
  return { kind: 'summaryOnly' };
}
