/**
 * 분기별 수강 관리 유틸리티 (Q 전용)
 */

/** 현재 분기 반환 — "2026-Q1" 형식 */
export function getCurrentQuarter(): string {
  const now = new Date();
  const year = now.getFullYear();
  const q = Math.ceil((now.getMonth() + 1) / 3);
  return `${year}-Q${q}`;
}

/** 분기 라벨 — "2026년 1분기" */
export function getQuarterLabel(quarter: string): string {
  const [year, q] = quarter.split('-Q');
  return `${year}년 ${q}분기`;
}

/** 분기에 속하는 월 배열 — "2026-Q1" → [1,2,3] */
export function getQuarterMonths(quarter: string): number[] {
  const q = Number.parseInt(quarter.split('-Q')[1], 10);
  const start = (q - 1) * 3 + 1;
  return [start, start + 1, start + 2];
}

/** 현재 ±2 분기 목록 */
export function getQuarterOptions(): { value: string; label: string }[] {
  const now = new Date();
  const year = now.getFullYear();
  const currentQ = Math.ceil((now.getMonth() + 1) / 3);
  const results: { value: string; label: string }[] = [];

  for (let offset = -2; offset <= 2; offset++) {
    let q = currentQ + offset;
    let y = year;
    while (q < 1) { q += 4; y -= 1; }
    while (q > 4) { q -= 4; y += 1; }
    const value = `${y}-Q${q}`;
    results.push({ value, label: getQuarterLabel(value) });
  }
  return results;
}

/** 분기 + 월 → YYYY-MM 형식 — "2026-Q1", 1 → "2026-01" */
export function quarterMonthToYYYYMM(quarter: string, month: number): string {
  const year = quarter.split('-Q')[0];
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** 이전 분기 반환 — "2026-Q2" → "2026-Q1", "2026-Q1" → "2025-Q4" */
export function getPreviousQuarter(quarter: string): string {
  const [yearStr, qStr] = quarter.split('-Q');
  let y = Number(yearStr);
  let q = Number(qStr) - 1;
  if (q < 1) { q = 4; y -= 1; }
  return `${y}-Q${q}`;
}
