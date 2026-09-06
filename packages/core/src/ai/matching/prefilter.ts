/**
 * 결정론 매칭 프리필터 — 확실한 건은 auto, 애매한 건만 LLM(MatchAdjudicator)으로 넘긴다.
 *
 * 목적: 결제 행(이름/전화/금액)을 대상 enrollment 후보로 좁힌다.
 *   - 전화 완전일치 → 학생 확정, 금액으로 등록 유일화 시 auto
 *   - 이름 정규화 일치 → 후보. 금액으로 유일화되면 auto, 동명이인·다강좌면 ambiguous
 *   - 후보 없음 → unmatched
 *
 * LLM 비용·환각을 줄이기 위해 확실한 건을 여기서 소화하고, 애매한 소수만 상위로 올린다. 참고: DEV §5.
 */
import { norm, amountNoteOf, editDistance } from './normalize';
import { getQuarterMonths } from '../../utils/quarterUtils';

export interface PrefilterStudent {
  id: string;
  name: string;
  phone?: string;
}
export interface PrefilterCourse {
  id: string;
  name: string;
  fee: number;
}
export interface PrefilterEnrollment {
  id: string;
  studentId: string;
  courseId: string;
  /** 수강 분기 "YYYY-QN" — 메모의 월로 대상 분기를 좁히는 데 사용 */
  quarter?: string;
  /**
   * 이 등록의 **실효 수강료**(할인 반영, course.fee - discount). 금액 매칭 기준.
   * 미지정이면 course.fee로 폴백. 할인 등록이 실제 낸 금액과 맞도록 하여 오토매칭 오류 방지.
   */
  fee?: number;
}

/** 계절어 → 대표 월(분기 판별용). 학원 통용: 봄=1분기대(3-4), 여름=3분기(7-8), 가을=4분기초(9-10), 겨울=4분기말(12,1). */
const SEASON_MONTHS: Record<string, number[]> = {
  봄: [3, 4],
  여름: [7, 8],
  가을: [9, 10],
  겨울: [12, 1],
};

/**
 * 메모에서 대상 월을 추출 → 월 번호 배열. 결정론.
 *   "7월분"→[7] · "3월,4월"→[3,4] · "2분기"→[4,5,6] · "여름학기"→[7,8]
 * 대상 분기를 좁히는 데 사용(prefilter). LLM 없이 계절·분기·월 표현을 모두 커버.
 */
export function monthsFromMemo(memo?: string): number[] {
  if (!memo) return [];
  const out = new Set<number>();
  // "N월"
  let m: RegExpExecArray | null;
  const monthRe = /(\d{1,2})\s*월/g;
  while ((m = monthRe.exec(memo)) !== null) {
    const mm = Number(m[1]);
    if (mm >= 1 && mm <= 12) out.add(mm);
  }
  // "N분기" → 해당 분기의 3개월
  const qRe = /([1-4])\s*분기/g;
  while ((m = qRe.exec(memo)) !== null) {
    const q = Number(m[1]);
    for (const mm of [(q - 1) * 3 + 1, (q - 1) * 3 + 2, (q - 1) * 3 + 3]) out.add(mm);
  }
  // 계절어
  for (const [word, months] of Object.entries(SEASON_MONTHS)) {
    if (memo.includes(word)) for (const mm of months) out.add(mm);
  }
  return Array.from(out).sort((a, b) => a - b);
}
export interface PrefilterInput {
  students: PrefilterStudent[];
  courses: PrefilterCourse[];
  enrollments: PrefilterEnrollment[];
}
export interface PrefilterRow {
  name: string;
  phone?: string;
  amount: number;
  paidAt?: string;
  memo?: string;
  /** 파일의 강좌/반 이름 — 단일 인물 다강좌에서 강좌를 좁히는 데 사용 */
  className?: string;
}
export interface PrefilterCandidate {
  enrollmentId: string;
  studentId: string;
  studentName: string;
  courseId: string;
  courseName: string;
  fee: number;
  /** 금액이 이 강좌 수강료와 정확/수수료차감 일치인가 (auto 판정용) */
  amountMatches: boolean;
  /** 수강 분기 "YYYY-QN" */
  quarter?: string;
}
export type PrefilterStatus = 'auto' | 'ambiguous' | 'unmatched';
export interface PrefilterResult {
  status: PrefilterStatus;
  candidates: PrefilterCandidate[];
  /** 매칭 근거(어떻게 좁혔는지) — 사람이 읽는 사유(툴팁·상세) */
  reason: string;
  /** UI 칩용 짧은 태그 (예: '전화 일치', '같은 이름 2명', '지난 분기'). 한눈에 스캔용. */
  tags: string[];
}

/** 숫자만 남긴 전화번호 (하이픈·공백 무시). */
function digits(s?: string): string {
  return (s ?? '').replace(/\D/g, '');
}

/**
 * 결제 행 → 후보 enrollment. status로 auto/ambiguous/unmatched 분류.
 * @param k 반환 후보 최대 개수
 */
export function prefilter(row: PrefilterRow, input: PrefilterInput, k = 5): PrefilterResult {
  const { students, courses, enrollments } = input;
  const courseById = new Map(courses.map((c) => [c.id, c]));
  const studentById = new Map(students.map((s) => [s.id, s]));

  // 1) 후보 학생 — 전화 완전일치 우선, 없으면 이름 정규화 일치
  const rowPhone = digits(row.phone);
  let matchedStudents: PrefilterStudent[] = [];
  let via = '';
  let viaTag = ''; // 칩용 짧은 토큰
  // 오타/근접 이름으로 매칭된 경우 — 절대 auto 금지(항상 사용자 확인). 잘못된 학생에 저장 방지.
  let viaFuzzy = false;
  if (rowPhone) {
    matchedStudents = students.filter((s) => s.phone && digits(s.phone) === rowPhone);
    if (matchedStudents.length) { via = '전화번호가 같아요'; viaTag = '전화 일치'; }
  }
  if (!matchedStudents.length) {
    const rn = norm(row.name);
    if (rn) {
      matchedStudents = students.filter((s) => norm(s.name) === rn);
      if (matchedStudents.length) { via = '이름이 같아요'; viaTag = '이름 일치'; }
    }
  }
  // 정확 일치 실패 시 이름 근접(편집거리 1) 폴백 — 오타·1글자 차이 복구. 후보로만 제시(자동 저장 안 함).
  if (!matchedStudents.length) {
    const rn = norm(row.name);
    if (rn.length >= 2) {
      matchedStudents = students.filter((s) => {
        const sn = norm(s.name);
        return sn.length >= 2 && editDistance(sn, rn) <= 1;
      });
      if (matchedStudents.length) {
        via = '이름이 비슷해요';
        viaTag = '이름 비슷';
        viaFuzzy = true;
      }
    }
  }
  if (!matchedStudents.length) {
    return { status: 'unmatched', candidates: [], reason: '등록된 학생 중에서 찾지 못했어요', tags: ['학생 없음'] };
  }

  // 2) 후보 enrollment (학생 × 등록 × 강좌)
  const matchedIds = new Set(matchedStudents.map((s) => s.id));
  const all: PrefilterCandidate[] = enrollments
    .filter((e) => matchedIds.has(e.studentId))
    .map((e) => {
      const c = courseById.get(e.courseId);
      const s = studentById.get(e.studentId);
      // 실효 수강료(할인 반영) 우선 — 없으면 course.fee. 할인 등록의 실제 납부액과 맞춰 오토매칭 오류 방지.
      const fee = e.fee ?? c?.fee ?? 0;
      const note = amountNoteOf(fee, row.amount);
      return {
        enrollmentId: e.id,
        studentId: e.studentId,
        studentName: s?.name ?? '',
        courseId: e.courseId,
        courseName: c?.name ?? '',
        fee,
        amountMatches: note === 'exact' || note === 'feeDeducted',
        quarter: e.quarter,
      };
    });

  if (!all.length) {
    return { status: 'unmatched', candidates: [], reason: '이 학생은 아직 수강 중인 강좌가 없어요', tags: ['수강 없음'] };
  }

  // 금액일치 후보를 앞으로 정렬
  const ranked = [...all].sort((a, b) => Number(b.amountMatches) - Number(a.amountMatches));

  // 3) 동명이인(사람이 2명 이상)이면 금액으로 한 명이 좁혀져도 '사람 특정'이 불확실 → 절대 auto 금지
  const distinctStudents = new Set(all.map((c) => c.studentId));
  if (distinctStudents.size > 1) {
    return {
      status: 'ambiguous',
      candidates: ranked.slice(0, k),
      reason: `이름이 같은 학생이 ${distinctStudents.size}명 있어요. 누구인지 골라 주세요`,
      tags: [`같은 이름 ${distinctStudents.size}명`],
    };
  }

  // 4) 단일 인물 — className으로 강좌를 먼저 좁히고, 그 다음 금액으로 유일화
  let scoped = all;
  let viaClass = '';
  let hasClass = false;
  let hasMemo = false;
  if (row.className) {
    const cn = norm(row.className);
    if (cn) {
      const byClass = all.filter((c) => {
        const c2 = norm(c.courseName);
        return c2.length > 0 && (c2.includes(cn) || cn.includes(c2));
      });
      if (byClass.length >= 1) {
        scoped = byClass;
        viaClass = ' · 강좌명도 맞아요';
        hasClass = true;
      }
    }
  }
  // 메모의 "N월"로 대상 분기를 좁힌다 (예: "7월분" → 여름 분기 등록 선택). 선납 오탐 방지.
  const memoMonths = monthsFromMemo(row.memo);
  if (memoMonths.length > 0) {
    const byQuarter = scoped.filter(
      (c) => c.quarter && getQuarterMonths(c.quarter).some((m) => memoMonths.includes(m)),
    );
    if (byQuarter.length >= 1) {
      scoped = byQuarter;
      viaClass += ' · 메모의 월로 분기 확인';
      hasMemo = true;
    }
  }
  const scopedRanked = [...scoped].sort((a, b) => Number(b.amountMatches) - Number(a.amountMatches));
  const feeMatched = scoped.filter((c) => c.amountMatches);
  const pool = feeMatched.length ? feeMatched : scoped;
  if (pool.length === 1) {
    // 연도 가드: 결제 연도와 등록 분기의 '연도'가 다르면 자동 저장 금지.
    // (예: 지난해 2025-Q3 미완납 등록만 있는데 올해 결제가 그 등록에 몰래 붙는 것을 방지)
    // 연말 선납(12월에 내년 1월분) 등 경계 케이스도 auto 대신 사용자 확인으로 안전하게 처리.
    const paymentYear = row.paidAt?.match(/^(\d{4})/)?.[1] ?? '';
    const only = pool[0];
    const yearMismatch = Boolean(paymentYear && only.quarter && !only.quarter.startsWith(`${paymentYear}-`));
    // 오타 근접 매칭·연도 불일치는 확실치 않으므로 자동 저장 금지 → 사용자 확인(후보 드롭다운)
    let reason: string;
    let tags: string[];
    if (viaFuzzy) {
      reason = '이름이 비슷한 학생이에요. 이 학생이 맞는지 확인해 주세요';
      tags = ['이름 비슷'];
    } else if (yearMismatch) {
      reason = `지난 분기(${only.quarter}) 수강 건이에요. 올해 결제가 맞는지 확인해 주세요`;
      tags = ['지난 분기'];
    } else {
      reason = `${via}${viaClass}${feeMatched.length ? ' · 금액도 딱 맞아요' : ''}`;
      tags = [
        viaTag,
        ...(hasClass ? ['강좌명'] : []),
        ...(hasMemo ? ['메모 월'] : []),
        ...(feeMatched.length ? ['금액 일치'] : []),
      ].filter(Boolean);
    }
    return {
      status: viaFuzzy || yearMismatch ? 'ambiguous' : 'auto',
      candidates: scopedRanked.slice(0, k),
      reason,
      tags,
    };
  }
  return {
    status: 'ambiguous',
    candidates: scopedRanked.slice(0, k),
    reason: '어느 수업 결제인지 확실하지 않아요. 골라 주세요',
    tags: [`강좌 ${pool.length}개`],
  };
}
