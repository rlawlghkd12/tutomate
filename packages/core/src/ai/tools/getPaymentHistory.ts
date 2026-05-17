import { z } from 'zod';
import dayjs from 'dayjs';
import quarterOfYear from 'dayjs/plugin/quarterOfYear';
import { supabase } from '../../config/supabase';
import type { ToolHandler } from '../types';

dayjs.extend(quarterOfYear);

const schema = z.object({
  studentId: z.string(),
  period: z.enum(['month', 'quarter', 'year']).optional(),
  limit: z.number().int().min(1).max(100).optional().default(20),
});

export const getPaymentHistory: ToolHandler<typeof schema> = {
  name: 'getPaymentHistory',
  description: '수강생의 결제 이력. 학생→enrollments→payment_records 조인.',
  schema,
  async execute({ studentId, period, limit }, _ctx) {
    if (!supabase) throw new Error('Supabase 미설정');

    const { data: enrolls } = await supabase
      .from('enrollments')
      .select('id, course_id, courses(name)')
      .eq('student_id', studentId);
    const enrollmentIds = (enrolls ?? []).map((e: any) => e.id);
    if (enrollmentIds.length === 0) return { payments: [] };

    let q = supabase
      .from('payment_records')
      .select('id, enrollment_id, paid_at, amount, payment_method, notes')
      .in('enrollment_id', enrollmentIds)
      .order('paid_at', { ascending: false })
      .limit(limit);
    if (period) {
      const since = dayjs().subtract(1, period).format('YYYY-MM-DD');
      q = q.gte('paid_at', since);
    }
    const { data, error } = await q;
    if (error) throw new Error(error.message);

    const courseByEnroll = new Map(
      (enrolls ?? []).map((e: any) => [e.id, e.courses?.name ?? null]),
    );
    return {
      payments: (data ?? []).map((p: any) => ({
        ...p,
        course_name: courseByEnroll.get(p.enrollment_id) ?? null,
      })),
    };
  },
};
