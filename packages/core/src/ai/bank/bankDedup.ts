/**
 * 은행 입금 저장 전 중복/초과 필터 — 순수 함수(돈 안전, 테스트 가능).
 *
 * 판정 규칙(자동매칭·'전체 추천대로' 건에만 적용, 사용자가 한 건씩 확인한 건은 항상 통과):
 *   (a) 정확중복  : 같은 enrollment·같은 날·같은 금액 (DB + 같은 파일 누적) → 제외(재업로드)
 *   (b) 같은 달 재업로드 : DB에 같은 enrollment·같은 달·같은 금액 기록 존재(수동입력 등) → 제외
 *   (c) 완납/초과 : 대상 수강 건이 이미 완납이거나 기존+신규 합이 수강료 초과 → 제외
 *                   (다른 달의 중복 이체 등). 실효 수강료를 아는 경우에만.
 *
 * 정상 분납(합계 ≤ 수강료)은 통과시킨다. 같은 파일 안 후속 건도 앞 건 저장분을 누적해 판정한다.
 */
import { checkDuplicate, type DedupPayment } from '../dedup/DedupChecker';

export interface BankExistingPayment {
  enrollmentId: string;
  paidAt: string;
  amount: number;
}

export interface BankDedupCandidate {
  enrollment_id: string;
  paid_at: string;
  amount: number;
  userConfirmed: boolean;
  /** '전체 추천대로' 일괄 적용 건 — userConfirmed여도 중복 검사를 적용한다 */
  viaRecommend?: boolean;
}

const ym = (s: string) => String(s).slice(0, 7); // YYYY-MM

/**
 * 저장할 후보 중 중복/초과 건을 제외한 목록을 원본 순서로 반환한다.
 * @param effectiveFeeById enrollment별 실효 수강료(할인 반영). 미지정이면 완납/초과 검사 생략.
 */
export function filterBankDuplicates<T extends BankDedupCandidate>(
  candidates: T[],
  existing: BankExistingPayment[],
  effectiveFeeById: Map<string, number>,
): T[] {
  // DB의 '같은 달·같은 금액'(수동입력 등) — DB 기록만 본다(같은 파일 정상 다회납부를 막지 않도록).
  const dbMonthKey = new Set(existing.map((e) => `${e.enrollmentId}|${ym(e.paidAt)}|${e.amount}`));
  // enrollment별 이력(DB) — 저장 확정분을 누적해 같은 파일 안 정확중복/완납초과도 잡는다.
  const historyById = new Map<string, DedupPayment[]>();
  for (const e of existing) {
    const list = historyById.get(e.enrollmentId) ?? [];
    list.push({ paidAt: e.paidAt, amount: e.amount });
    historyById.set(e.enrollmentId, list);
  }

  const out: T[] = [];
  for (const c of candidates) {
    const history = historyById.get(c.enrollment_id) ?? [];
    const accept = () => {
      history.push({ paidAt: c.paid_at, amount: c.amount });
      historyById.set(c.enrollment_id, history);
      out.push(c);
    };
    if (c.userConfirmed && !c.viaRecommend) {
      accept();
      continue;
    }
    const exact = history.some((h) => h.paidAt === c.paid_at && h.amount === c.amount);
    const month = dbMonthKey.has(`${c.enrollment_id}|${ym(c.paid_at)}|${c.amount}`);
    if (exact || month) continue;
    // 완납/초과 검사는 '입금(양수)'에만 적용한다. 환불(음수)은 잔액을 줄이는 정상 거래이므로
    // 완납 상태를 근거로 막으면 안 된다(checkDuplicate는 부호를 보지 않아 환불이 완납판정에 걸림).
    const fee = effectiveFeeById.get(c.enrollment_id);
    if (c.amount > 0 && fee !== undefined) {
      const dup = checkDuplicate({ effectiveFee: fee, existing: history, incoming: { paidAt: c.paid_at, amount: c.amount } });
      if (dup.action !== 'include') continue;
    }
    accept();
  }
  return out;
}
