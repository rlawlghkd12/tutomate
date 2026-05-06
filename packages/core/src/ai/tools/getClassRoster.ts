import { z } from 'zod';
import { supabase } from '../../config/supabase';
import type { ToolHandler } from '../types';

const schema = z.object({ classId: z.string() });

export const getClassRoster: ToolHandler<typeof schema> = {
  name: 'getClassRoster',
  description: '특정 강좌의 수강생 명단',
  schema,
  async execute({ classId }, ctx) {
    if (!supabase) throw new Error('Supabase 미설정');
    const { data, error } = await supabase
      .from('enrollments')
      .select('students!inner(id, name, phone)')
      .eq('course_id', classId)
      .eq('org_id', ctx.orgId);
    if (error) throw new Error(error.message);
    return { roster: (data ?? []).map((r: any) => r.students) };
  },
};
