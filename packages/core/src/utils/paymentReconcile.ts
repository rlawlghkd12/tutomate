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

/** 정렬에 필요한 최소 필드 */
export interface DatedRecordLite {
  amount: number;
  paidAt?: string;
  createdAt?: string;
}

/**
 * 최신 납부 순 정렬: 납부일(paidAt)이 늦은 것 먼저, 같은 날이면 나중에 입력한 것(createdAt) 먼저.
 * 같은 납부일로 다시 입력한 기록(예: 현금 → 계좌이체 재입력)이 예전 기록에 밀리지 않게 한다.
 */
export function byLatest(a: DatedRecordLite, b: DatedRecordLite): number {
  const byPaidAt = (b.paidAt || '').localeCompare(a.paidAt || '');
  if (byPaidAt !== 0) return byPaidAt;
  return (Date.parse(b.createdAt || '') || 0) - (Date.parse(a.createdAt || '') || 0);
}

/**
 * 결제수단을 바꿨을 때, 결제수단을 함께 고쳐야 할 기록을 고른다.
 *
 * 수강의 결제수단은 이력 합산 동기화 때 "가장 최근 양수 기록"의 결제수단으로 다시 계산된다.
 * 그래서 분납처럼 요약만 바꾸면 나중에 동기화될 때 예전 결제수단으로 되돌아간다.
 * 가장 최근 양수 기록의 결제수단이 고른 값과 다르면 그 기록의 id를, 같거나 없으면 null을 준다.
 */
export function findMethodFixTarget<T extends DatedRecordLite & { id: string; paymentMethod?: string }>(
  records: readonly T[],
  method: string,
): string | null {
  const latest = records.filter((r) => r.amount > 0).sort(byLatest)[0];
  if (!latest || latest.paymentMethod === method) return null;
  return latest.id;
}
