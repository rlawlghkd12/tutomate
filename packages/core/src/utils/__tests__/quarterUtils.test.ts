import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  getCurrentQuarter,
  getQuarterLabel,
  getQuarterMonths,
  getQuarterOptions,
  quarterMonthToYYYYMM,
} from '../quarterUtils';

afterEach(() => {
  vi.useRealTimers();
});

// ─── getCurrentQuarter ─────────────────────────────────────────────────────

describe('getCurrentQuarter', () => {
  it('1월 → Q1', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15'));
    expect(getCurrentQuarter()).toBe('2026-Q1');
  });

  it('3월 → Q1 (분기 마지막 달)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-31'));
    expect(getCurrentQuarter()).toBe('2026-Q1');
  });

  it('4월 → Q2', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-01'));
    expect(getCurrentQuarter()).toBe('2026-Q2');
  });

  it('6월 → Q2', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-30'));
    expect(getCurrentQuarter()).toBe('2026-Q2');
  });

  it('7월 → Q3', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-01'));
    expect(getCurrentQuarter()).toBe('2026-Q3');
  });

  it('10월 → Q4', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-01'));
    expect(getCurrentQuarter()).toBe('2026-Q4');
  });

  it('12월 → Q4 (분기 마지막)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-12-31'));
    expect(getCurrentQuarter()).toBe('2026-Q4');
  });

  it('연도 포함 형식 반환', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-09-01'));
    expect(getCurrentQuarter()).toBe('2025-Q3');
  });
});

// ─── getQuarterLabel ───────────────────────────────────────────────────────

describe('getQuarterLabel', () => {
  it('2026-Q1 → "2026년 1분기"', () => {
    expect(getQuarterLabel('2026-Q1')).toBe('2026년 1분기');
  });

  it('2026-Q2 → "2026년 2분기"', () => {
    expect(getQuarterLabel('2026-Q2')).toBe('2026년 2분기');
  });

  it('2026-Q3 → "2026년 3분기"', () => {
    expect(getQuarterLabel('2026-Q3')).toBe('2026년 3분기');
  });

  it('2026-Q4 → "2026년 4분기"', () => {
    expect(getQuarterLabel('2026-Q4')).toBe('2026년 4분기');
  });

  it('다른 연도 처리', () => {
    expect(getQuarterLabel('2025-Q2')).toBe('2025년 2분기');
  });
});

// ─── getQuarterMonths ──────────────────────────────────────────────────────

describe('getQuarterMonths', () => {
  it('Q1 → [1, 2, 3]', () => {
    expect(getQuarterMonths('2026-Q1')).toEqual([1, 2, 3]);
  });

  it('Q2 → [4, 5, 6]', () => {
    expect(getQuarterMonths('2026-Q2')).toEqual([4, 5, 6]);
  });

  it('Q3 → [7, 8, 9]', () => {
    expect(getQuarterMonths('2026-Q3')).toEqual([7, 8, 9]);
  });

  it('Q4 → [10, 11, 12]', () => {
    expect(getQuarterMonths('2026-Q4')).toEqual([10, 11, 12]);
  });

  it('항상 3개 월 반환', () => {
    for (let q = 1; q <= 4; q++) {
      expect(getQuarterMonths(`2026-Q${q}`)).toHaveLength(3);
    }
  });
});

// ─── getQuarterOptions ─────────────────────────────────────────────────────

describe('getQuarterOptions', () => {
  it('현재 분기 기준 ±2 분기 — 총 5개 반환', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-01')); // Q2
    const options = getQuarterOptions();
    expect(options).toHaveLength(5);
  });

  it('value는 YYYY-Q# 형식', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-01'));
    const options = getQuarterOptions();
    for (const opt of options) {
      expect(opt.value).toMatch(/^\d{4}-Q[1-4]$/);
    }
  });

  it('label은 한국어 분기 형식', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-01'));
    const options = getQuarterOptions();
    for (const opt of options) {
      expect(opt.label).toMatch(/\d{4}년 \d분기/);
    }
  });

  it('Q1에서 -2 → 전년도 Q3/Q4 처리', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01')); // Q1
    const options = getQuarterOptions();
    expect(options).toHaveLength(5);
    // 가장 이른 분기는 2025-Q3
    expect(options[0].value).toBe('2025-Q3');
    expect(options[4].value).toBe('2026-Q3');
  });

  it('Q4에서 +2 → 다음 연도 Q1/Q2 처리', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-01')); // Q4
    const options = getQuarterOptions();
    expect(options).toHaveLength(5);
    // 가장 늦은 분기는 2027-Q2
    expect(options[4].value).toBe('2027-Q2');
  });
});

// ─── quarterMonthToYYYYMM ─────────────────────────────────────────────────

describe('quarterMonthToYYYYMM', () => {
  it('2026-Q1, 1 → "2026-01"', () => {
    expect(quarterMonthToYYYYMM('2026-Q1', 1)).toBe('2026-01');
  });

  it('2026-Q2, 4 → "2026-04"', () => {
    expect(quarterMonthToYYYYMM('2026-Q2', 4)).toBe('2026-04');
  });

  it('2026-Q3, 9 → "2026-09"', () => {
    expect(quarterMonthToYYYYMM('2026-Q3', 9)).toBe('2026-09');
  });

  it('2026-Q4, 12 → "2026-12"', () => {
    expect(quarterMonthToYYYYMM('2026-Q4', 12)).toBe('2026-12');
  });

  it('월이 한 자리면 0패딩', () => {
    expect(quarterMonthToYYYYMM('2026-Q1', 3)).toBe('2026-03');
  });

  it('다른 연도 처리', () => {
    expect(quarterMonthToYYYYMM('2025-Q4', 11)).toBe('2025-11');
  });
});
