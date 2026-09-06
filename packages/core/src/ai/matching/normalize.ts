/**
 * 매칭 프리필터용 순수 문자열 유틸 (결정론, 테스트 가능).
 *
 * 은행 흐름(depositMatcher)에서 쓰던 이름·강좌 정규화/거리 함수를 공통 모듈로 분리해
 * 일반 임포트 흐름도 동일하게 재사용한다(프리필터 → 애매행만 LLM). 참고: DEV §5.
 */

/** 수수료 차감·경계 오차로 볼 수 있는 최대 부족액(원). 이보다 더 부족하면 부분 납부로 본다. */
export const FEE_TOLERANCE = 1000;

/**
 * 입금액과 수강료의 관계 라벨.
 * - exact: 정확히 일치
 * - feeDeducted: 이체 수수료 등으로 소액(≤FEE_TOLERANCE) 부족
 * - partial: 부분 납부 (수강료보다 많이 부족)
 * - over: 초과 입금
 */
export type AmountNote = 'exact' | 'feeDeducted' | 'partial' | 'over';

export function amountNoteOf(fee: number, amount: number): AmountNote {
  if (amount === fee) return 'exact';
  if (amount < fee) return fee - amount <= FEE_TOLERANCE ? 'feeDeducted' : 'partial';
  return 'over';
}

/** 공백·구두점 제거. 한글은 그대로. 비교를 관대하게 하기 위한 정규화. */
export function norm(s: string): string {
  return String(s)
    .replace(/[\s.,·()\[\]{}/\\|·.~!@#$%^&*\-_+=]/g, '')
    .toLowerCase();
}

/** a, b의 글자 단위 Levenshtein 거리 (오타 1~2 보정용, 짧은 문자열만). */
export function editDistance(a: string, b: string): number {
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
export function findCourseInName(
  payerNorm: string,
  course: { name: string },
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
