import { z } from 'zod';
import { supabase } from '../../config/supabase';
import type { ToolHandler } from '../types';

const schema = z.object({ studentId: z.string() });

export const getEnrollment: ToolHandler<typeof schema> = {
  name: 'getEnrollment',
  description: '수강생의 강좌 등록 정보',
  schema,
  async execute({ studentId }, ctx) {
    if (!supabase) throw new Error('Supabase 미설정');
    const { data, error } = await supabase
      .from('enrollments')
      .select('id, course_id, status, started_at, ended_at, courses!inner(id, name)')
      .eq('student_id', studentId)
      .eq('org_id', ctx.orgId);
    if (error) throw new Error(error.message);
    return { enrollments: data ?? [] };
  },
};
