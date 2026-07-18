import type { BankTransaction } from './parseBankExcel';

/**
 * 은행 입금 거래 ↔ 수강생/강좌 매칭 엔진 (순수 함수, 테스트 가능).
 *
 * 입금자명("내용")은 다음과 같이 제각각이라 결정적 파싱이 불가능하다:
 *   - 강좌+이름:  합창최남기 / 드럼주미희 / 최진선건강증진소
 *   - 이름+(강좌): 김숙영(태극권) / 우신애(시니어)
 *   - 이름 공백 강좌: 곽청옥 합창 / 김남희 태극권
 *   - 이름만:     오한기 / 김선미
 *   - 그룹/코드:  사군자9명 / 740704535B / 농협-김정희
 *
 * 그래서 "강좌명이 입금자명 안에 들어있는가"를 DB 강좌목록 기준으로 역으로 탐지하고,
 * 남은 토큰을 학생 이름과 대조한다. 확신도에 따라 3분류한다:
 *   - auto:        강좌+학생 유일 매칭 + 금액이 강좌 수강료와 일치 → 미리보기 일괄 확정 대상
 *   - needsConfirm: 이름만 / 동명이인 / 금액 불일치 등 → 사용자에게 후보 제시 후 확인
 *   - unmatched:   그룹결제·코드·미등록 → 수동 처리
 */

export interface MatchCourse {
  id: string;
  name: string;
  fee: number;
}
export interface MatchStudent {
  id: string;
  name: string;
}
export interface MatchEnrollment {
  /** enrollments.id — 확정 저장 시 payment_records.enrollment_id로 사용 */
  id: string;
  studentId: string;
  courseId: string;
}

export interface MatchInput {
  courses: MatchCourse[];
  students: MatchStudent[];
  /** 이번 분기(또는 분기 없는 일반 데이터) 등록 — 기본 매칭 대상 */
  enrollments: MatchEnrollment[];
  /**
   * 직전 분기 등록 — 재수강 감지용.
   * 이번 분기 등록이 없어 '신규 등록'으로 갈 뻔한 건 중, 같은 학생·강좌가 지난 분기에 있으면
   * 후보에 priorEnrollmentId를 실어 '지난 분기 등록에 저장' 선택지를 제공한다.
   */
  prevEnrollments?: MatchEnrollment[];
}

export type MatchStatus =
  | 'auto'
  | 'needsConfirm'
  | 'unmatched'
  | 'needsEnrollment'
  | 'needsSplit'
  | 'needsRefund';

/**
 * 입금액과 수강료의 관계 라벨.
 * - exact: 정확히 일치 (auto 대상)
 * - feeDeducted: 이체 수수료 등으로 소액(≤FEE_TOLERANCE) 부족 — "수수료 빼고 딱 맞음"
 * - partial: 부분 납부 (수강료보다 많이 부족)
 * - over: 초과 입금 (합산 분할 가능성)
 */
export type AmountNote = 'exact' | 'feeDeducted' | 'partial' | 'over';

/** 수수료 차감으로 볼 수 있는 최대 부족액(원). 이보다 더 부족하면 부분 납부로 본다. */
const FEE_TOLERANCE = 1000;

export function amountNoteOf(fee: number, amount: number): AmountNote {
  if (amount === fee) return 'exact';
  if (amount < fee) return fee - amount <= FEE_TOLERANCE ? 'feeDeducted' : 'partial';
  return 'over';
}

/** 후보 정렬 순위: 정확 > 수수료차감 > 초과 > 부분 (금액 신뢰도 순) */
function amountRank(fee: number, amount: number): number {
  const n = amountNoteOf(fee, amount);
  return n === 'exact' ? 3 : n === 'feeDeducted' ? 2 : n === 'over' ? 1 : 0;
}

/**
 * 확정(confirmBankDeposits)에 보낼 사용자 선택.
 * - enrollmentId: 기존 등록에 저장
 * - newEnrollment: 등록이 없어 새로 등록하면서 저장 (needsEnrollment 건)
 * - split: 한 입금을 여러 강의 등록에 나눠 저장 (needsSplit 건, 합산 입금)
 * - refund: 출금을 해당 등록의 환불(음수 결제)로 저장 (needsRefund 건)
 */
export interface DepositSelection {
  rowIndex: number;
  enrollmentId?: string;
  newEnrollment?: { studentId: string; courseId: string; quarter?: string };
  split?: { enrollmentId: string; amount: number }[];
  refund?: { enrollmentId: string; amount: number };
  /**
   * '전체 추천대로 처리'로 일괄 적용된 건 표시.
   * 사용자가 한 건씩 의식적으로 확인한 게 아니므로, 확정 시 중복 검사를 그대로 적용한다
   * (건별 '그래도 저장'처럼 중복을 일부러 넘기는 게 아님 → 재업로드 중복 방지).
   */
  viaRecommend?: boolean;
}

/** needsConfirm일 때 사용자에게 제시할 후보 (학생×강좌=등록 조합). */
export interface MatchCandidate {
  /** payment_records.enrollment_id 로 저장됨 */
  enrollmentId: string;
  studentId: string;
  studentName: string;
  courseId: string;
  courseName: string;
  fee: number;
  /** 입금액이 이 강좌 수강료와 정확히 일치하는가 (auto 판정·강조용) */
  amountMatches: boolean;
  /** 입금액과 수강료 관계 라벨(수수료차감/부분/초과) — 카드 라벨·정렬용. matchDeposit이 후처리로 채운다. */
  amountNote?: AmountNote;
  /** 직전 달에도 이 등록에 같은 금액을 낸 정기 패턴 — analyzeBankDeposits가 채운다(반복 확인 부담↓). */
  recurring?: boolean;
  /**
   * 이 후보는 아직 등록(enrollment)이 없어 "새로 등록 후 저장"해야 하는 건이다.
   * 이때 enrollmentId는 빈 문자열이며, 확정 시 studentId+courseId로 등록을 생성한다.
   */
  isNewEnrollment?: boolean;
  /**
   * 이 학생·강좌가 '직전 분기'에 등록돼 있으면 그 등록 id (재수강).
   * isNewEnrollment 후보에 붙어, 카드가 '지난 분기 등록에 저장'(=이 id로 결제 저장)을 제공한다.
   * existingPayments에는 이 지난 분기 등록의 결제 이력이 주입된다.
   */
  priorEnrollmentId?: string;
  /**
   * 이 등록(enrollment)에 이미 저장돼 있는 결제 이력 (날짜·금액).
   * 매칭 엔진은 기존 결제를 모르므로 도구(analyzeBankDeposits)가 주입한다.
   * 사용자가 "이번 입금이 이미 받은 건지" 직접 비교하도록 카드에 보여준다.
   */
  existingPayments?: { paidAt: string; amount: number }[];
}

export interface DepositMatch {
  tx: BankTransaction;
  status: MatchStatus;
  /** auto 또는 needsConfirm의 1순위 제안 */
  studentId?: string;
  studentName?: string;
  courseId?: string;
  courseName?: string;
  /** needsConfirm 시 선택지 */
  candidates: MatchCandidate[];
  /** 사람이 읽는 분류 사유 (UI·디버깅) */
  reason: string;
}

/** 공백·구두점 제거. 한글은 그대로. 비교를 관대하게 하기 위한 정규화. */
export function norm(s: string): string {
  return String(s)
    .replace(/[\s.,·()\[\]{}/\\|·.~!@#$%^&*\-_+=]/g, '')
    .toLowerCase();
}

/** a, b의 글자 단위 Levenshtein 거리 (오타 1~2 보정용, 짧은 문자열만). */
function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > 2) return 99;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

/**
 * 입금자명 안에서 강좌가 매칭되면 그 부분을 제거한 "이름 후보"와 함께 반환.
 * - 강좌명 전체가 부분문자열로 포함 (강함)
 * - 강좌명 앞 2글자 이상이 포함 (별칭/약어: 필라테스→필라, 라인댄스→라인)
 * - 편집거리 1 이내 (오타: 태극권→태극퀀)
 */
function findCourseInName(
  payerNorm: string,
  course: MatchCourse,
): { matchedText: string } | null {
  const cn = norm(course.name);
  if (!cn) return null;

  // 1) 전체 포함
  if (payerNorm.includes(cn)) return { matchedText: cn };

  // 2) 약어 — 강좌명 prefix(2~연속) 가 payer에 포함. 최소 2글자, 강좌명의 절반 이상.
  const minLen = Math.max(2, Math.ceil(cn.length / 2));
  for (let len = cn.length - 1; len >= minLen; len--) {
    const prefix = cn.slice(0, len);
    if (payerNorm.includes(prefix)) return { matchedText: prefix };
  }

  // 3) 오타 — payer의 동일 길이 윈도우 중 편집거리 1 이내
  if (cn.length >= 3) {
    for (let i = 0; i + cn.length <= payerNorm.length; i++) {
      const window = payerNorm.slice(i, i + cn.length);
      if (editDistance(window, cn) <= 1) return { matchedText: window };
    }
  }
  return null;
}

const GROUP_RE = /\d+\s*명/; // "사군자9명", "윤영진외4명"
const CODE_RE = /^[0-9a-zA-Z\-_.]+$/; // "740704535B"

/** 입금 1건 매칭 + 모든 후보에 amountNote(금액 관계 라벨) 후처리. */
export function matchDeposit(tx: BankTransaction, input: MatchInput): DepositMatch {
  const m = matchDepositInner(tx, input);
  for (const c of m.candidates) {
    c.amountNote = amountNoteOf(c.fee, tx.amount);
  }
  return m;
}

function matchDepositInner(tx: BankTransaction, input: MatchInput): DepositMatch {
  const base = (over: Partial<DepositMatch>): DepositMatch => ({
    tx,
    status: 'unmatched',
    candidates: [],
    reason: '',
    ...over,
  });

  const payer = tx.payerName;
  if (!payer) return base({ reason: '입금자명이 비어 있음' });
  if (GROUP_RE.test(payer)) return base({ reason: '여러 명 묶음 입금 — 수동 처리 필요' });
  if (CODE_RE.test(payer)) return base({ reason: '식별 불가한 코드/번호' });

  const payerNorm = norm(payer);

  // 학생별 수강 등록(강좌 + enrollmentId) 인덱스
  const courseById = new Map(input.courses.map((c) => [c.id, c]));
  const enrollsByStudent = new Map<string, { course: MatchCourse; enrollmentId: string }[]>();
  for (const e of input.enrollments) {
    const c = courseById.get(e.courseId);
    if (!c) continue;
    const arr = enrollsByStudent.get(e.studentId) ?? [];
    arr.push({ course: c, enrollmentId: e.id });
    enrollsByStudent.set(e.studentId, arr);
  }

  // 직전 분기 등록 인덱스 (재수강 감지용)
  const prevEnrollsByStudent = new Map<string, { course: MatchCourse; enrollmentId: string }[]>();
  for (const e of input.prevEnrollments ?? []) {
    const c = courseById.get(e.courseId);
    if (!c) continue;
    const arr = prevEnrollsByStudent.get(e.studentId) ?? [];
    arr.push({ course: c, enrollmentId: e.id });
    prevEnrollsByStudent.set(e.studentId, arr);
  }
  /** (학생, 강좌)의 직전 분기 등록 id — 재수강이면 그 id, 아니면 undefined */
  const priorIdOf = (studentId: string, courseId: string): string | undefined =>
    (prevEnrollsByStudent.get(studentId) ?? []).find((x) => x.course.id === courseId)?.enrollmentId;

  // payer에 이름이 포함되는 학생들 (정확 일치 우선, 길이 긴 이름 우선)
  const studentHits = input.students
    .filter((s) => s.name && payerNorm.includes(norm(s.name)))
    .sort((a, b) => b.name.length - a.name.length);

  // payer에 들어있는 강좌들
  const courseHits = input.courses
    .map((c) => ({ course: c, hit: findCourseInName(payerNorm, c) }))
    .filter((x): x is { course: MatchCourse; hit: { matchedText: string } } => x.hit !== null)
    .sort((a, b) => b.hit.matchedText.length - a.hit.matchedText.length);

  // ── 분류 ──

  // A. 강좌가 잡힘 → 강좌 수강생 중에 payer 이름이 있는지
  if (courseHits.length > 0) {
    const candidates: MatchCandidate[] = [];
    for (const { course } of courseHits) {
      for (const s of studentHits) {
        const en = (enrollsByStudent.get(s.id) ?? []).find((x) => x.course.id === course.id);
        if (!en) continue;
        candidates.push({
          enrollmentId: en.enrollmentId,
          studentId: s.id,
          studentName: s.name,
          courseId: course.id,
          courseName: course.name,
          fee: course.fee,
          amountMatches: course.fee === tx.amount,
        });
      }
    }
    const uniq = dedupeCandidates(candidates);
    if (uniq.length === 1) {
      const c = uniq[0];
      if (c.amountMatches) {
        return base({
          status: 'auto',
          studentId: c.studentId,
          studentName: c.studentName,
          courseId: c.courseId,
          courseName: c.courseName,
          candidates: uniq,
          reason: '강좌·수강생·금액 모두 일치',
        });
      }
      return base({
        status: 'needsConfirm',
        studentId: c.studentId,
        studentName: c.studentName,
        courseId: c.courseId,
        courseName: c.courseName,
        candidates: uniq,
        reason: `강좌·수강생은 맞지만 입금액(${tx.amount})이 수강료(${c.fee})와 다름`,
      });
    }
    if (uniq.length > 1) {
      // 합산 입금: 같은 학생의 여러 등록 수강료 합이 입금액과 같으면 나눠 저장 제안
      const split = trySplit(uniq, tx.amount);
      if (split) {
        return base({
          status: 'needsSplit',
          studentId: split[0].studentId,
          studentName: split[0].studentName,
          candidates: split,
          reason: `여러 강의 합산 입금(${split.length}개) — 나눠서 저장 제안`,
        });
      }
      const sorted = sortByAmount(uniq, tx.amount);
      return base({
        status: 'needsConfirm',
        candidates: sorted,
        reason: '강좌는 잡혔지만 수강생 후보가 여러 명 (동명이인 등)',
      });
    }
    // 강좌·학생 이름은 모두 잡혔지만 그 학생이 그 강좌에 '등록(enrollment)'돼 있지 않음.
    // → "이 학생을 이 강의에 새로 등록하고 저장할까요?" 후보(needsEnrollment).
    //   오인 등록을 막기 위해 (강좌×학생) 단일 조합 + 금액이 수강료와 일치할 때만 제안한다.
    const newPairs: MatchCandidate[] = [];
    const seenPair = new Set<string>();
    for (const { course } of courseHits) {
      for (const s of studentHits) {
        const k = `${s.id}|${course.id}`;
        if (seenPair.has(k)) continue;
        seenPair.add(k);
        newPairs.push({
          enrollmentId: '',
          studentId: s.id,
          studentName: s.name,
          courseId: course.id,
          courseName: course.name,
          fee: course.fee,
          amountMatches: course.fee === tx.amount,
          isNewEnrollment: true,
        });
      }
    }
    const feeMatched = newPairs.filter((c) => c.amountMatches);
    if (feeMatched.length === 1) {
      const c = feeMatched[0];
      const priorId = priorIdOf(c.studentId, c.courseId);
      return base({
        status: 'needsEnrollment',
        studentId: c.studentId,
        studentName: c.studentName,
        courseId: c.courseId,
        courseName: c.courseName,
        candidates: [{ ...c, priorEnrollmentId: priorId }],
        reason: priorId
          ? `'${c.studentName}'님은 지난 분기 '${c.courseName}' 수강 이력이 있음 — 이번 분기 새 등록 또는 지난 분기 등록에 저장`
          : `'${c.studentName}'님이 '${c.courseName}' 강의에 아직 등록되지 않음 — 새로 등록 후 저장 제안`,
      });
    }
    // 그 외(이름만 잡힘·금액 불일치·후보 모호)는 이름만 흐름으로 폴백
  }

  // B. 이름만 → 그 학생의 수강 강좌 중 금액 맞는 강좌 추론 (반드시 확인)
  if (studentHits.length === 1) {
    const s = studentHits[0];
    const taken = enrollsByStudent.get(s.id) ?? [];
    const cands: MatchCandidate[] = taken.map((t) => ({
      enrollmentId: t.enrollmentId,
      studentId: s.id,
      studentName: s.name,
      courseId: t.course.id,
      courseName: t.course.name,
      fee: t.course.fee,
      amountMatches: t.course.fee === tx.amount,
    }));
    if (cands.length === 0) {
      // 이번 분기 등록은 없지만 지난 분기에 금액이 맞는 강좌 등록이 딱 하나 있으면 재수강 제안.
      // (branch A와 동일하게 금액 일치 단일 후보일 때만 — 오인 등록 방지)
      const prevFeeMatch = (prevEnrollsByStudent.get(s.id) ?? []).filter(
        (t) => t.course.fee === tx.amount,
      );
      if (prevFeeMatch.length === 1) {
        const t = prevFeeMatch[0];
        return base({
          status: 'needsEnrollment',
          studentId: s.id,
          studentName: s.name,
          courseId: t.course.id,
          courseName: t.course.name,
          candidates: [
            {
              enrollmentId: '',
              studentId: s.id,
              studentName: s.name,
              courseId: t.course.id,
              courseName: t.course.name,
              fee: t.course.fee,
              amountMatches: true,
              isNewEnrollment: true,
              priorEnrollmentId: t.enrollmentId,
            },
          ],
          reason: `'${s.name}'님은 지난 분기 '${t.course.name}' 수강 이력이 있음 — 이번 분기 새 등록 또는 지난 분기 등록에 저장`,
        });
      }
      return base({ reason: `'${s.name}' 수강 중인 강좌 없음` });
    }
    // 합산 입금: 이 학생의 여러 등록 수강료 합이 입금액과 같으면 나눠 저장 제안
    const split = trySplit(cands, tx.amount);
    if (split) {
      return base({
        status: 'needsSplit',
        studentId: s.id,
        studentName: s.name,
        candidates: split,
        reason: `여러 강의 합산 입금(${split.length}개) — 나눠서 저장 제안`,
      });
    }
    const sorted = sortByAmount(cands, tx.amount);
    const feeMatch = sorted.filter((c) => c.amountMatches);
    const top = feeMatch[0] ?? sorted[0];
    return base({
      status: 'needsConfirm',
      studentId: s.id,
      studentName: s.name,
      courseId: top.courseId,
      courseName: top.courseName,
      candidates: sorted,
      reason:
        feeMatch.length === 1
          ? '이름만 입력 — 금액이 맞는 강좌로 추정, 확인 필요'
          : feeMatch.length > 1
            ? '이름만 입력 — 금액 맞는 강좌가 여러 개, 확인 필요'
            : '이름만 입력 — 금액과 맞는 강좌 없음, 확인 필요',
    });
  }

  // C. 동명이인 (이름은 여러 명, 강좌 단서 없음)
  if (studentHits.length > 1) {
    const cands: MatchCandidate[] = [];
    for (const s of studentHits) {
      for (const t of enrollsByStudent.get(s.id) ?? []) {
        cands.push({
          enrollmentId: t.enrollmentId,
          studentId: s.id,
          studentName: s.name,
          courseId: t.course.id,
          courseName: t.course.name,
          fee: t.course.fee,
          amountMatches: t.course.fee === tx.amount,
        });
      }
    }
    return base({
      status: 'needsConfirm',
      candidates: sortByAmount(cands, tx.amount),
      reason: '같은 이름의 수강생이 여러 명 — 누구인지 확인 필요',
    });
  }

  // D. 아무것도 못 찾음
  return base({ reason: '일치하는 수강생을 찾지 못함' });
}

/**
 * 합산 입금 감지: 후보(같은 학생의 서로 다른 등록)가 2개 이상이고
 * 수강료 합이 입금액과 정확히 같으면, 각 등록에 수강료만큼 나눠 저장할 후보 목록을 반환.
 * 부분 합(일부 강의만)은 오인 위험이 커서 다루지 않고 전체 합만 본다.
 */
function trySplit(cands: MatchCandidate[], amount: number): MatchCandidate[] | null {
  const uniq = dedupeCandidates(cands);
  if (uniq.length < 2) return null;
  const sum = uniq.reduce((a, c) => a + c.fee, 0);
  return sum === amount ? uniq : null;
}

function dedupeCandidates(cands: MatchCandidate[]): MatchCandidate[] {
  const seen = new Set<string>();
  const out: MatchCandidate[] = [];
  for (const c of cands) {
    const k = `${c.studentId}|${c.courseId}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(c);
  }
  return out;
}

/** 금액 일치 후보를 앞으로 정렬. */
function sortByAmount(cands: MatchCandidate[], amount: number): MatchCandidate[] {
  return [...dedupeCandidates(cands)].sort(
    (a, b) => amountRank(b.fee, amount) - amountRank(a.fee, amount),
  );
}

export function matchDeposits(
  txs: BankTransaction[],
  input: MatchInput,
): DepositMatch[] {
  return txs.map((tx) => matchDeposit(tx, input));
}

/**
 * SmartCard(UI)로 보낼 평탄한 미리보기 항목. DepositMatch에서 직렬화하기 쉬운 형태만 추린다.
 * UI는 status별로 묶어 보여주고, needsConfirm은 candidates에서 사용자가 하나 고른다.
 */
export interface BankDepositPreviewItem {
  rowIndex: number;
  payerName: string;
  amount: number;
  paidAt: string;
  method: string;
  status: MatchStatus;
  reason: string;
  /** auto 또는 needsConfirm 1순위 제안 (없을 수 있음) */
  enrollmentId?: string;
  studentName?: string;
  courseName?: string;
  candidates: MatchCandidate[];
  /**
   * 기존 결제 이력과 (등록·날짜·금액)이 모두 겹치는 중복인가.
   * 매칭 엔진은 기존 결제를 모르므로 도구(analyzeBankDeposits)가 1순위 enrollmentId 기준으로 주입한다.
   */
  duplicate?: boolean;
}

export function toPreviewItem(m: DepositMatch): BankDepositPreviewItem {
  return {
    rowIndex: m.tx.rowIndex,
    payerName: m.tx.payerName,
    amount: m.tx.amount,
    paidAt: m.tx.paidAt,
    method: m.tx.method,
    status: m.status,
    reason: m.reason,
    enrollmentId: m.candidates.find((c) => c.studentId === m.studentId && c.courseId === m.courseId)?.enrollmentId,
    studentName: m.studentName,
    courseName: m.courseName,
    candidates: m.candidates,
  };
}
