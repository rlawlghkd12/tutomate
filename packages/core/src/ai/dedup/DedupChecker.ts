/**
 * 결제 중복 판정 — 순수 함수 (돈 안전, LLM 불가침).
 *
 * 판정 단위는 "납부한 날짜(paid_at)의 달"이 아니라 **대상 수강 건(enrollment = 학생+강좌+분기)**.
 * 그 수강 건이 이미 완납/초과인지로 본다. 그래야:
 *   - 같은 분기를 다른 달에 두 번 내면(정탐) 잡고,
 *   - 다른 분기 선납(오탐)은 통과시킨다.
 *
 * 3단계:
 *   L1 정확중복(existKey)  : 같은 enrollment·같은 paid_at·같은 금액이 이미 있음 → 재업로드, 기본 제외
 *   L2 기간중복/초과       : 대상 enrollment가 이미 완납(paidSum ≥ effectiveFee) 이거나
 *                            기존+신규 합이 수강료를 초과 → 의심, 사용자 확인
 *   L3 정상                : 부분납부(합계 ≤ 수강료) 또는 결제 없는 미래 분기 → 통과
 *
 * 참고: DEV §4, PLAN FR-3, CONTEXT '기간중복/완납초과'.
 */

/** 수수료 차감·경계 오차로 볼 수 있는 허용액(원). depositMatcher의 FEE_TOLERANCE와 동일 정책. */
export const FEE_TOLERANCE = 1000;

export interface DedupPayment {
  /** YYYY-MM-DD */
  paidAt: string;
  amount: number;
}

export interface DedupInput {
  /** 할인·면제 반영한 실제 수강료 (course.fee - enrollment.discountAmount). 완납 판정 기준. */
  effectiveFee: number;
  /** 대상 enrollment(분기)의 기존 결제 이력. 반드시 같은 enrollment 것만. */
  existing: DedupPayment[];
  /** 이번에 저장하려는 결제. */
  incoming: DedupPayment;
}

export type DedupLevel = 'exact' | 'periodComplete' | 'overpay' | 'none';

export interface DedupResult {
  level: DedupLevel;
  /** exclude: 기본 제외(재업로드) · confirm: 자동저장 금지·사용자 확인 · include: 정상 저장 */
  action: 'exclude' | 'confirm' | 'include';
  /** UI 배지·툴팁용 한국어 사유 (include일 때는 빈 문자열) */
  reason: string;
}

/**
 * 중복 판정. 대상 enrollment가 매칭으로 확정된 뒤 호출한다(MatchEngine → DedupChecker 순서).
 */
export function checkDuplicate(input: DedupInput): DedupResult {
  const { effectiveFee, existing, incoming } = input;

  // L1 정확중복 — 같은 날·같은 금액 레코드가 이미 있음 (재업로드)
  const exact = existing.some(
    (e) => e.paidAt === incoming.paidAt && e.amount === incoming.amount,
  );
  if (exact) {
    return { level: 'exact', action: 'exclude', reason: '이미 저장된 결제예요 (같은 파일을 또 올리신 것 같아요)' };
  }

  const paidSum = existing.reduce((s, e) => s + e.amount, 0);

  // L2a 완납 — 대상 수강 건이 이미 다 냈음.
  // paidSum>0 조건: 기존 결제가 전혀 없으면(첫 납부) 완납일 수 없다. 수강료가 아주 작아
  // (≤FEE_TOLERANCE) `0 >= fee - tolerance`가 참이 되는 경우를 방지.
  if (paidSum > 0 && paidSum >= effectiveFee - FEE_TOLERANCE) {
    return { level: 'periodComplete', action: 'confirm', reason: '이 수업은 이미 다 냈어요' };
  }

  // L2b 초과 — 기존 + 신규 합이 수강료를 초과
  if (paidSum + incoming.amount > effectiveFee + FEE_TOLERANCE) {
    return { level: 'overpay', action: 'confirm', reason: '지금까지 낸 돈을 합치면 수강료보다 많아요' };
  }

  // L3 정상 — 부분납부(합계 ≤ 수강료) 또는 결제 없는 미래 분기
  return { level: 'none', action: 'include', reason: '' };
}
