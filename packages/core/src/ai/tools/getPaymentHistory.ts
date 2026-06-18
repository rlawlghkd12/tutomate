import { z } from 'zod';
import dayjs from 'dayjs';
import quarterOfYear from 'dayjs/plugin/quarterOfYear';
import { supabase } from '../../config/supabase';
import type { ToolHandler } from '../types';

dayjs.extend(quarterOfYear);

const schema = z.object({
  studentId: z.string(),
  // 특정 달(YYYY-MM) 지정 시 해당 달만. period보다 우선.
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  // 최근 기간(상대) — month 미지정 시에만 적용
  period: z.enum(['month', 'quarter', 'year']).optional(),
  limit: z.number().int().min(1).max(100).optional().default(20),
});

export const getPaymentHistory: ToolHandler<typeof schema> = {
  name: 'getPaymentHistory',
  description: '수강생의 결제 이력. 학생→enrollments→payment_records 조인. month=YYYY-MM로 특정 달, period로 최근 기간 조회.',
  schema,
  async execute({ studentId, month, period, limit }, _ctx) {
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
    if (month) {
      // 달력 월 = [월초, 다음달초) — paid_at은 DATE
      const monthStart = `${month}-01`;
      const nextMonthStart = dayjs(monthStart).add(1, 'month').format('YYYY-MM-DD');
      q = q.gte('paid_at', monthStart).lt('paid_at', nextMonthStart);
    } else if (period) {
      const since = dayjs().subtract(1, period).format('YYYY-MM-DD');
      q = q.gte('paid_at', since);
    }
    const { data, error } = await q;
    if (error) throw new Error(error.message);

    const courseByEnroll = new Map(
      (enrolls ?? []).map((e: any) => [e.id, e.courses?.name ?? null]),
    );
    // amount<0 = 환불, >0 = 입금. 합산 시 분리해서 보고.
    const records = (data ?? []).map((p: any) => ({
      ...p,
      course_name: courseByEnroll.get(p.enrollment_id) ?? null,
      type: (p.amount ?? 0) < 0 ? 'refund' : 'payment',
    }));
    const paidTotal = records.filter((p: any) => p.amount > 0).reduce((s: number, p: any) => s + p.amount, 0);
    const refundTotal = records.filter((p: any) => p.amount < 0).reduce((s: number, p: any) => s + p.amount, 0);
    return {
      paidTotal,
      refundTotal: Math.abs(refundTotal),
      netTotal: paidTotal + refundTotal,
      records,
    };
  },
};
