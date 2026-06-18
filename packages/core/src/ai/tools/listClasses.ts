import { z } from 'zod';
import { supabase } from '../../config/supabase';
import { DAY_LABELS } from '../../types';
import { formatClassTime } from '../../utils/scheduleUtils';
import { getCurrentQuarter } from '../../utils/quarterUtils';
import type { ToolHandler } from '../types';

const schema = z.object({ studentId: z.string().optional() });

const COLUMNS = 'id, name, instructor_name, classroom, max_students, schedule';

function shape(c: any, enrolled: number) {
  const days: number[] | undefined = c.schedule?.daysOfWeek;
  return {
    // 내부 식별용 — 사용자에게 표시 금지 (getClassRoster/getCoursePayments 연계용)
    id: c.id,
    name: c.name,
    instructor: c.instructor_name,
    days:
      Array.isArray(days) && days.length
        ? [...days].sort((a, b) => a - b).map((d) => DAY_LABELS[d]).join(' ')
        : null,
    time:
      c.schedule?.startTime && c.schedule?.endTime
        ? formatClassTime(c.schedule.startTime, c.schedule.endTime)
        : null,
    classroom: c.classroom,
    // current_students 컬럼은 비정규화 카운터라 실제와 어긋남 → 실제 등록 수로 계산
    students: `${enrolled}/${c.max_students ?? 0}`,
  };
}

// 강좌별 실제 수강인원 = 이번 분기 활성 등록 수 (강좌 페이지와 동일: withdrawn 제외)
async function activeCounts(courseIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (!courseIds.length || !supabase) return counts;
  const quarter = getCurrentQuarter();
  const { data, error } = await supabase
    .from('enrollments')
    .select('course_id')
    .in('course_id', courseIds)
    .neq('payment_status', 'withdrawn')
    .eq('quarter', quarter);
  if (error) throw new Error(error.message);
  for (const e of data ?? []) {
    const id = (e as any).course_id;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

export const listClasses: ToolHandler<typeof schema> = {
  name: 'listClasses',
  description:
    '강좌 목록 (강좌명·강사명·요일·시간·강의실·수강인원). 수강인원은 이번 분기 활성 등록 기준(강좌 페이지와 동일). studentId 지정 시 해당 수강생이 등록한 강좌만.',
  schema,
  async execute({ studentId }, _ctx) {
    if (!supabase) throw new Error('Supabase 미설정');
    let courses: any[];
    if (studentId) {
      const { data, error } = await supabase
        .from('enrollments')
        .select(`courses!inner(${COLUMNS})`)
        .eq('student_id', studentId);
      if (error) throw new Error(error.message);
      courses = (data ?? []).map((r: any) => r.courses);
    } else {
      const { data, error } = await supabase.from('courses').select(COLUMNS);
      if (error) throw new Error(error.message);
      courses = data ?? [];
    }
    const counts = await activeCounts(courses.map((c) => c.id));
    return { classes: courses.map((c) => shape(c, counts.get(c.id) ?? 0)) };
  },
};
