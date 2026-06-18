import { z } from 'zod';
import { supabase } from '../../config/supabase';
import { getCurrentQuarter } from '../../utils/quarterUtils';
import type { ToolHandler } from '../types';

const schema = z.object({ classId: z.string() });

export const getClassRoster: ToolHandler<typeof schema> = {
  name: 'getClassRoster',
  description: '특정 강좌의 수강생 명단 (이번 분기 활성 등록 기준, 탈퇴 제외)',
  schema,
  async execute({ classId }, _ctx) {
    if (!supabase) throw new Error('Supabase 미설정');
    // listClasses 수강인원과 동일 기준: 이번 분기 + 탈퇴(withdrawn) 제외
    const { data, error } = await supabase
      .from('enrollments')
      .select('students!inner(id, name, phone)')
      .eq('course_id', classId)
      .neq('payment_status', 'withdrawn')
      .eq('quarter', getCurrentQuarter());
    if (error) throw new Error(error.message);
    return { roster: (data ?? []).map((r: any) => r.students) };
  },
};
