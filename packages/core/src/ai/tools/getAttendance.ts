import { z } from 'zod';
import { supabase } from '../../config/supabase';
import type { ToolHandler } from '../types';

const schema = z.object({
  studentId: z.string(),
  period: z.string().regex(/^\d{4}-\d{2}$/).optional(),
});

export const getAttendance: ToolHandler<typeof schema> = {
  name: 'getAttendance',
  description: '수강생의 출석 기록 (period: YYYY-MM)',
  schema,
  async execute({ studentId, period }, ctx) {
    if (!supabase) throw new Error('Supabase 미설정');
    let q = supabase
      .from('attendance_records')
      .select('session_date, status')
      .eq('student_id', studentId)

      .order('session_date', { ascending: false })
      .limit(50);
    if (period) {
      q = q.gte('session_date', `${period}-01`).lte('session_date', `${period}-31`);
    }
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return { attendance: data ?? [] };
  },
};
