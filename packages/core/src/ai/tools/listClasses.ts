import { z } from 'zod';
import { supabase } from '../../config/supabase';
import type { ToolHandler } from '../types';

const schema = z.object({ studentId: z.string().optional() });

export const listClasses: ToolHandler<typeof schema> = {
  name: 'listClasses',
  description: '강좌 목록. studentId 지정 시 해당 수강생이 등록한 강좌만.',
  schema,
  async execute({ studentId }, ctx) {
    if (!supabase) throw new Error('Supabase 미설정');
    if (studentId) {
      const { data, error } = await supabase
        .from('enrollments')
        .select('courses!inner(id, name, instructor_name)')
        .eq('student_id', studentId)
;
      if (error) throw new Error(error.message);
      return { classes: (data ?? []).map((r: any) => r.courses) };
    }
    const { data, error } = await supabase
      .from('courses')
      .select('id, name, instructor_name')
;
    if (error) throw new Error(error.message);
    return { classes: data ?? [] };
  },
};
