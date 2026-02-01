import dayjs from 'dayjs';
import type { CourseSchedule } from '../types';

// 강좌의 모든 수업 날짜 생성
export const generateClassDates = (schedule: CourseSchedule): string[] => {
  const { startDate, endDate, daysOfWeek, holidays } = schedule;

  const dates: string[] = [];
  let currentDate = dayjs(startDate);
  const end = dayjs(endDate);

  while (currentDate.isBefore(end) || currentDate.isSame(end, 'day')) {
    const dayOfWeek = currentDate.day();

    // 수업 요일이고 휴강일이 아닌 경우
    if (daysOfWeek.includes(dayOfWeek) && !holidays.includes(currentDate.format('YYYY-MM-DD'))) {
      dates.push(currentDate.format('YYYY-MM-DD'));
    }

    currentDate = currentDate.add(1, 'day');
  }

  return dates;
};

// 다음 수업일 찾기
export const getNextClassDate = (schedule: CourseSchedule): string | null => {
  const today = dayjs();
  const classDates = generateClassDates(schedule);

  const nextDate = classDates.find((date) => dayjs(date).isAfter(today, 'day'));
  return nextDate || null;
};

// 오늘 수업이 있는지 확인
export const hasTodayClass = (schedule: CourseSchedule): boolean => {
  const today = dayjs().format('YYYY-MM-DD');
  const classDates = generateClassDates(schedule);
  return classDates.includes(today);
};

// 남은 수업 회차 계산
export const getRemainingSessionsCount = (schedule: CourseSchedule): number => {
  const today = dayjs();
  const classDates = generateClassDates(schedule);

  const remainingDates = classDates.filter((date) => dayjs(date).isAfter(today, 'day'));
  return remainingDates.length;
};

// 진행된 수업 회차 계산
export const getCompletedSessionsCount = (schedule: CourseSchedule): number => {
  const today = dayjs();
  const classDates = generateClassDates(schedule);

  const completedDates = classDates.filter(
    (date) => dayjs(date).isBefore(today, 'day') || dayjs(date).isSame(today, 'day')
  );
  return completedDates.length;
};

// 수업 진행률 계산 (%)
export const getCourseProgress = (schedule: CourseSchedule): number => {
  const completed = getCompletedSessionsCount(schedule);
  const total = schedule.totalSessions;

  if (total === 0) return 0;
  return Math.min((completed / total) * 100, 100);
};

// 요일 번호를 한글로 변환
export const getDayOfWeekLabel = (dayOfWeek: number): string => {
  const labels = ['일', '월', '화', '수', '목', '금', '토'];
  return labels[dayOfWeek] || '';
};

// 요일 배열을 문자열로 변환 (예: "월, 수, 금")
export const formatDaysOfWeek = (daysOfWeek: number[]): string => {
  return daysOfWeek
    .sort()
    .map((day) => getDayOfWeekLabel(day))
    .join(', ');
};

// 수업 시간 포맷 (예: "19:00-21:00")
export const formatClassTime = (startTime: string, endTime: string): string => {
  return `${startTime}-${endTime}`;
};

// 전체 일정 요약 문자열 (예: "월,수,금 19:00-21:00 (2024-01-01 ~ 2024-03-31)")
export const formatScheduleSummary = (schedule: CourseSchedule): string => {
  const days = formatDaysOfWeek(schedule.daysOfWeek);
  const time = formatClassTime(schedule.startTime, schedule.endTime);
  const period = `${schedule.startDate} ~ ${schedule.endDate}`;

  return `${days} ${time} (${period})`;
};
