import { z } from 'zod';
import { supabase } from '../../config/supabase';
import type { ToolHandler } from '../types';

const schema = z.object({ studentId: z.string() });

export const getStudentSummary: ToolHandler<typeof schema> = {
  name: 'getStudentSummary',
  description: '수강생 종합 요약 — 정보 + 등록 강좌 + 최근 결제',
  schema,
  async execute({ studentId }, _ctx) {
    if (!supabase) throw new Error('Supabase 미설정');

    const [studentRes, enrollRes] = await Promise.all([
      supabase.from('students').select('*').eq('id', studentId).maybeSingle(),
      supabase
        .from('enrollments')
        .select('id, payment_status, paid_amount, remaining_amount, courses(id, name)')
        .eq('student_id', studentId),
    ]);

    if (!studentRes.data) {
      return { error: { code: 'not_found', message: '수강생을 찾을 수 없습니다.' } };
    }

    const enrollmentIds = (enrollRes.data ?? []).map((e: any) => e.id);
    let recentPayments: any[] = [];
    if (enrollmentIds.length > 0) {
      const { data: pays } = await supabase
        .from('payment_records')
        .select('paid_at, amount, payment_method, enrollment_id')
        .in('enrollment_id', enrollmentIds)
        .order('paid_at', { ascending: false })
        .limit(5);
      recentPayments = pays ?? [];
    }

    return {
      student: studentRes.data,
      enrollments: enrollRes.data ?? [],
      recentPayments,
    };
  },
};
