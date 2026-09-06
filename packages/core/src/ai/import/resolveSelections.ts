import type { DedupPayment } from '../dedup/DedupChecker';

/**
 * UI에서 고른 결제 selections 중 실제로 저장할 행을 결정 — 순수 함수.
 * 정확 재업로드(같은 enrollment·날짜·금액)만 제외하고, 나머지는 사용자 선택을 존중해 저장한다.
 * 배치 내 누적: 같은 파일에 동일 결제가 2번 선택돼도 두 번째는 정확중복으로 제외.
 * (완납/초과는 사용자가 미리보기에서 명시적으로 체크한 경우이므로 여기서 막지 않는다.)
 */
export interface SelectionInput {
  enrollmentId: string;
  paidAt: string;
  amount: number;
  paymentMethod?: 'cash' | 'card' | 'transfer';
}

export interface ResolveSelectionsResult<T extends SelectionInput> {
  inserts: T[];
  /** 정확중복으로 제외된 건 수 */
  duplicated: number;
}

export function resolveSelectionInserts<T extends SelectionInput>(
  selections: T[],
  existingByEnrollment: Map<string, DedupPayment[]>,
): ResolveSelectionsResult<T> {
  // 원본 맵을 건드리지 않도록 배열을 복제해 누적한다.
  const acc = new Map<string, DedupPayment[]>();
  for (const [k, v] of existingByEnrollment) acc.set(k, [...v]);

  const inserts: T[] = [];
  let duplicated = 0;
  for (const s of selections) {
    const existing = acc.get(s.enrollmentId) ?? [];
    const exact = existing.some((e) => e.paidAt === s.paidAt && e.amount === s.amount);
    if (exact) {
      duplicated++;
      continue;
    }
    acc.set(s.enrollmentId, [...existing, { paidAt: s.paidAt, amount: s.amount }]);
    inserts.push(s);
  }
  return { inserts, duplicated };
}
