import { describe, it, expect, vi, afterEach } from 'vitest';
import type { CourseSchedule } from '../../types';
import {
  generateClassDates,
  getNextClassDate,
  hasTodayClass,
  getRemainingSessionsCount,
  getCompletedSessionsCount,
  getCourseProgress,
  getDayOfWeekLabel,
  formatDaysOfWeek,
  formatClassTime,
  formatScheduleSummary,
} from '../scheduleUtils';

afterEach(() => {
  vi.useRealTimers();
});

// ─── 테스트 헬퍼 ──────────────────────────────────────────────────────────

function makeSchedule(overrides: Partial<CourseSchedule> = {}): CourseSchedule {
  return {
    startDate: '2026-01-05', // 월요일
    daysOfWeek: [1], // 월요일
    startTime: '09:00',
    endTime: '10:00',
    totalSessions: 4,
    holidays: [],
    ...overrides,
  };
}

// ─── generateClassDates ───────────────────────────────────────────────────

describe('generateClassDates', () => {
  it('totalSessions 횟수만큼 날짜 생성 (endDate 없음)', () => {
    const schedule = makeSchedule({ daysOfWeek: [1], totalSessions: 4 }); // 4주 월요일
    const dates = generateClassDates(schedule);
    expect(dates).toHaveLength(4);
  });

  it('endDate 있으면 해당 기간 내 날짜만', () => {
    const schedule: CourseSchedule = {
      startDate: '2026-01-05',
      endDate: '2026-01-19', // 3주 동안의 월요일
      daysOfWeek: [1],
      startTime: '09:00',
      endTime: '10:00',
      totalSessions: 10,
      holidays: [],
    };
    const dates = generateClassDates(schedule);
    // 01-05, 01-12, 01-19 → 3개
    expect(dates).toHaveLength(3);
    expect(dates).toContain('2026-01-05');
    expect(dates).toContain('2026-01-12');
    expect(dates).toContain('2026-01-19');
  });

  it('휴강일 제외', () => {
    const schedule = makeSchedule({
      daysOfWeek: [1],
      totalSessions: 4,
      holidays: ['2026-01-05'], // 첫 월요일 휴강
    });
    const dates = generateClassDates(schedule);
    expect(dates).not.toContain('2026-01-05');
    expect(dates).toHaveLength(4); // 여전히 4회 (다음 월요일들로 채움)
  });

  it('여러 요일 — 월,수 (1,3)', () => {
    const schedule: CourseSchedule = {
      startDate: '2026-01-05',
      endDate: '2026-01-11',
      daysOfWeek: [1, 3], // 월, 수
      startTime: '09:00',
      endTime: '10:00',
      totalSessions: 10,
      holidays: [],
    };
    const dates = generateClassDates(schedule);
    // 01-05(월), 01-07(수) → 2개
    expect(dates).toHaveLength(2);
  });

  it('빈 daysOfWeek → 날짜 생성 안됨 (2년 초과 방지)', () => {
    const schedule = makeSchedule({ daysOfWeek: [] });
    const dates = generateClassDates(schedule);
    expect(dates).toHaveLength(0);
  });

  it('totalSessions 0, endDate 없음 → 기본값 100 적용', () => {
    // 매일 수업 (0~6 전 요일)
    const schedule: CourseSchedule = {
      startDate: '2026-01-05',
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      startTime: '09:00',
      endTime: '10:00',
      totalSessions: 0,
      holidays: [],
    };
    const dates = generateClassDates(schedule);
    expect(dates).toHaveLength(100);
  });

  it('endDate가 startDate와 같으면 1일 (해당 요일이면)', () => {
    const schedule: CourseSchedule = {
      startDate: '2026-01-05', // 월요일
      endDate: '2026-01-05',
      daysOfWeek: [1], // 월
      startTime: '09:00',
      endTime: '10:00',
      totalSessions: 5,
      holidays: [],
    };
    const dates = generateClassDates(schedule);
    expect(dates).toHaveLength(1);
    expect(dates[0]).toBe('2026-01-05');
  });

  it('모든 날 휴강이면 결국 빈 배열 또는 2년 방지로 종료', () => {
    // 매일 모두 휴강이면 2년 이후 break
    // 이 테스트는 너무 오래 걸리므로 간단한 케이스만: endDate 방식으로 확인
    const schedule: CourseSchedule = {
      startDate: '2026-01-05',
      endDate: '2026-01-11',
      daysOfWeek: [1, 3],
      startTime: '09:00',
      endTime: '10:00',
      totalSessions: 5,
      holidays: ['2026-01-05', '2026-01-07'],
    };
    const dates = generateClassDates(schedule);
    expect(dates).toHaveLength(0);
  });
});

// ─── getNextClassDate ─────────────────────────────────────────────────────

describe('getNextClassDate', () => {
  it('다음 수업일 반환 (오늘 이후)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-04')); // 일요일 (1월 5일 이전)
    const schedule = makeSchedule({ daysOfWeek: [1], totalSessions: 4 });
    const next = getNextClassDate(schedule);
    expect(next).toBe('2026-01-05');
  });

  it('오늘이 수업일이면 오늘은 제외, 다음 수업일 반환', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-05')); // 오늘이 수업일
    const schedule = makeSchedule({ daysOfWeek: [1], totalSessions: 4 });
    const next = getNextClassDate(schedule);
    // 오늘은 제외 → 다음 월요일
    expect(next).toBe('2026-01-12');
  });

  it('모든 수업 지났으면 null 반환', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2027-12-31')); // 2년 이후
    const schedule = makeSchedule({ daysOfWeek: [1], totalSessions: 4 });
    const next = getNextClassDate(schedule);
    expect(next).toBeNull();
  });
});

// ─── hasTodayClass ────────────────────────────────────────────────────────

describe('hasTodayClass', () => {
  it('오늘이 수업일 → true', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-05')); // 월요일
    const schedule = makeSchedule({ daysOfWeek: [1], totalSessions: 4 });
    expect(hasTodayClass(schedule)).toBe(true);
  });

  it('오늘이 수업일 아님 → false', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-06')); // 화요일 (월요일 수업)
    const schedule = makeSchedule({ daysOfWeek: [1], totalSessions: 4 });
    expect(hasTodayClass(schedule)).toBe(false);
  });

  it('오늘이 휴강일 → false', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-05')); // 월요일이지만 휴강
    const schedule = makeSchedule({
      daysOfWeek: [1],
      totalSessions: 4,
      holidays: ['2026-01-05'],
    });
    expect(hasTodayClass(schedule)).toBe(false);
  });
});

// ─── getRemainingSessionsCount ─────────────────────────────────────────────

describe('getRemainingSessionsCount', () => {
  it('오늘 이전 수업만 있으면 0', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-05')); // 4주 이후
    const schedule = makeSchedule({ daysOfWeek: [1], totalSessions: 4 });
    expect(getRemainingSessionsCount(schedule)).toBe(0);
  });

  it('오늘 이후 수업 개수 반환', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-04')); // 첫 수업 전날
    const schedule = makeSchedule({ daysOfWeek: [1], totalSessions: 4 });
    expect(getRemainingSessionsCount(schedule)).toBe(4);
  });
});

// ─── getCompletedSessionsCount ─────────────────────────────────────────────

describe('getCompletedSessionsCount', () => {
  it('첫 수업 전 → 0', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-04')); // 수업 전
    const schedule = makeSchedule({ daysOfWeek: [1], totalSessions: 4 });
    expect(getCompletedSessionsCount(schedule)).toBe(0);
  });

  it('오늘이 수업일이면 오늘도 포함', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-05')); // 첫 수업일
    const schedule = makeSchedule({ daysOfWeek: [1], totalSessions: 4 });
    expect(getCompletedSessionsCount(schedule)).toBe(1);
  });

  it('2번째 수업 이후 → 완료 2개', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-12')); // 2번째 수업
    const schedule = makeSchedule({ daysOfWeek: [1], totalSessions: 4 });
    expect(getCompletedSessionsCount(schedule)).toBe(2);
  });
});

// ─── getCourseProgress ─────────────────────────────────────────────────────

describe('getCourseProgress', () => {
  it('totalSessions 0 → 0%', () => {
    const schedule = makeSchedule({ totalSessions: 0 });
    expect(getCourseProgress(schedule)).toBe(0);
  });

  it('절반 진행 → 50%', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-12')); // 2번째 수업 (4회 중 2회)
    const schedule = makeSchedule({ daysOfWeek: [1], totalSessions: 4 });
    expect(getCourseProgress(schedule)).toBe(50);
  });

  it('100% 초과 불가 — Math.min(completed/total * 100, 100)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2027-12-31')); // 모든 수업 완료 이후
    const schedule = makeSchedule({ daysOfWeek: [1], totalSessions: 4 });
    expect(getCourseProgress(schedule)).toBeLessThanOrEqual(100);
  });
});

// ─── getDayOfWeekLabel ────────────────────────────────────────────────────

describe('getDayOfWeekLabel', () => {
  it.each([
    [0, '일'],
    [1, '월'],
    [2, '화'],
    [3, '수'],
    [4, '목'],
    [5, '금'],
    [6, '토'],
  ])('%d → "%s"', (day, label) => {
    expect(getDayOfWeekLabel(day)).toBe(label);
  });

  it('범위 밖 값 → 빈 문자열', () => {
    expect(getDayOfWeekLabel(7)).toBe('');
    expect(getDayOfWeekLabel(-1)).toBe('');
  });
});

// ─── formatDaysOfWeek ─────────────────────────────────────────────────────

describe('formatDaysOfWeek', () => {
  it('[1, 3, 5] → "월, 수, 금"', () => {
    expect(formatDaysOfWeek([1, 3, 5])).toBe('월, 수, 금');
  });

  it('정렬 후 변환 — [5, 1, 3] → "월, 수, 금"', () => {
    expect(formatDaysOfWeek([5, 1, 3])).toBe('월, 수, 금');
  });

  it('단일 요일 → 하나만', () => {
    expect(formatDaysOfWeek([2])).toBe('화');
  });

  it('빈 배열 → 빈 문자열', () => {
    expect(formatDaysOfWeek([])).toBe('');
  });
});

// ─── formatClassTime ──────────────────────────────────────────────────────

describe('formatClassTime', () => {
  it('"09:00", "10:00" → "09:00-10:00"', () => {
    expect(formatClassTime('09:00', '10:00')).toBe('09:00-10:00');
  });

  it('"19:00", "21:00" → "19:00-21:00"', () => {
    expect(formatClassTime('19:00', '21:00')).toBe('19:00-21:00');
  });
});

// ─── formatScheduleSummary ────────────────────────────────────────────────

describe('formatScheduleSummary', () => {
  it('endDate 없으면 — 시작일 + 총 회차 표시', () => {
    const schedule = makeSchedule({ daysOfWeek: [1, 3], totalSessions: 12 });
    const summary = formatScheduleSummary(schedule);
    expect(summary).toContain('월, 수');
    expect(summary).toContain('09:00-10:00');
    expect(summary).toContain('2026-01-05 시작, 총 12회');
  });

  it('endDate 있으면 — 시작일 ~ 종료일 표시', () => {
    const schedule: CourseSchedule = {
      ...makeSchedule(),
      endDate: '2026-03-30',
    };
    const summary = formatScheduleSummary(schedule);
    expect(summary).toContain('2026-01-05 ~ 2026-03-30');
  });

  it('요일 정보 포함', () => {
    const schedule = makeSchedule({ daysOfWeek: [1, 5] });
    const summary = formatScheduleSummary(schedule);
    expect(summary).toContain('월, 금');
  });
});
