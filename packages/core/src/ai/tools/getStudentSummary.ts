import { z } from 'zod';
import { supabase } from '../../config/supabase';
import type { ToolHandler } from '../types';

const schema = z.object({ studentId: z.string() });

export const getStudentSummary: ToolHandler<typeof schema> = {
  name: 'getStudentSummary',
  description: '수강생 종합 요약 (등록 강좌, 최근 결제, 출석률 등)',
  schema,
  async execute({ studentId }, ctx) {
    if (!supabase) throw new Error('Supabase 미설정');
    const [{ data: student }, { data: payments }, { data: enrolls }] =
      await Promise.all([
        supabase
          .from('students')
          .select('*')
          .eq('id', studentId)
          .eq('org_id', ctx.orgId)
          .maybeSingle(),
        supabase
          .from('payment_records')
          .select('paid_at, amount')
          .eq('student_id', studentId)
          .order('paid_at', { ascending: false })
          .limit(5),
        supabase
          .from('enrollments')
          .select('courses!inner(name), status')
          .eq('student_id', studentId),
      ]);
    return {
      student,
      recentPayments: payments ?? [],
      enrollments: enrolls ?? [],
    };
  },
};
