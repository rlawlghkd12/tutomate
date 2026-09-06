/**
 * 비결제 행(합계·소계 등) 결정론 판별 — 순수 함수.
 * 이런 행은 학생과 매칭되지 않아 어차피 제외되지만, 명확한 사유를 붙여 미리보기를 정리한다.
 * 참고: DEV §3.2(RowClassify의 결정론 대체), FR "불필요한 행 거르기".
 */

/**
 * 한글 합계류 — 이런 접두로 시작하면 비결제 행(예: "합계금액"). 한글 이름은 이 접두로 시작하지 않음.
 */
const KO_SUBTOTAL_PREFIX = ['합계', '소계', '총계', '누계', '이월', '잔액', '미납계', '총액'];
/**
 * 정확일치만 허용하는 키워드 — 영문("sum"으로 시작하는 실명 "Sumin" 등)·1글자('계')의 오탐 방지.
 */
const EXACT_NON_PAYMENT = ['계', 'total', 'subtotal', 'sum', 'balance'];

/** 이름 칸 텍스트가 합계·소계 등 비결제 행인지. */
export function isNonPaymentRowName(name: string | undefined): boolean {
  const n = (name ?? '').replace(/\s/g, '').toLowerCase();
  if (!n) return false;
  // 영문/1글자는 정확일치만 (Latin 실명 오탐 방지)
  if (EXACT_NON_PAYMENT.some((k) => n === k.toLowerCase())) return true;
  // 한글 합계류는 접두 일치 허용 (한글 실명은 이 접두로 시작하지 않음)
  return KO_SUBTOTAL_PREFIX.some((k) => n === k || n.startsWith(k));
}
