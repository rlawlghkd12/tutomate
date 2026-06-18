import { z } from 'zod';
import dayjs from 'dayjs';
import { supabase } from '../../config/supabase';
import type { ToolHandler } from '../types';

const schema = z.object({
  classId: z.string(),
  // 특정 달(YYYY-MM) 지정 시 해당 달만
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  limit: z.number().int().min(1).max(200).optional().default(100),
});

export const getCoursePayments: ToolHandler<typeof schema> = {
  name: 'getCoursePayments',
  description:
    '특정 강좌의 결제 내역과 합계. 강좌의 등록 전체를 한 번에 모아 조회하므로 수강생별 개별 조회 불필요. month=YYYY-MM로 특정 달만.',
  schema,
  async execute({ classId, month, limit }, _ctx) {
    if (!supabase) throw new Error('Supabase 미설정');

    // 1) 강좌의 등록 + 학생 이름 (1쿼리)
    const { data: enrolls, error: enrollErr } = await supabase
      .from('enrollments')
      .select('id, student_id, students(name)')
      .eq('course_id', classId);
    if (enrollErr) throw new Error(enrollErr.message);
    const enrollmentIds = (enrolls ?? []).map((e: any) => e.id);
    if (enrollmentIds.length === 0) return { month: month ?? null, count: 0, totalAmount: 0, payments: [] };

    const nameByEnroll = new Map((enrolls ?? []).map((e: any) => [e.id, e.students?.name ?? null]));

    // 2) 해당 등록들의 결제 기록 (1쿼리) — 학생 수와 무관하게 총 2쿼리
    let q = supabase
      .from('payment_records')
      .select('id, enrollment_id, paid_at, amount, payment_method, notes')
      .in('enrollment_id', enrollmentIds)
      .order('paid_at', { ascending: false })
      .limit(limit);
    if (month) {
      const monthStart = `${month}-01`;
      const nextMonthStart = dayjs(monthStart).add(1, 'month').format('YYYY-MM-DD');
      q = q.gte('paid_at', monthStart).lt('paid_at', nextMonthStart);
    }
    const { data, error } = await q;
    if (error) throw new Error(error.message);

    // amount<0 = 환불(payment.refund), >0 = 입금. 섞어서 합치면 매출이 음수로 보이므로 분리.
    const records = (data ?? []).map((p: any) => ({
      ...p,
      student_name: nameByEnroll.get(p.enrollment_id) ?? null,
      type: (p.amount ?? 0) < 0 ? 'refund' : 'payment',
    }));
    const paidTotal = records.filter((p: any) => p.amount > 0).reduce((s: number, p: any) => s + p.amount, 0);
    const refundTotal = records.filter((p: any) => p.amount < 0).reduce((s: number, p: any) => s + p.amount, 0);
    return {
      month: month ?? null,
      count: records.length,
      paidTotal, // 입금 합계 (매출)
      refundTotal: Math.abs(refundTotal), // 환불 합계 (양수로 표기)
      netTotal: paidTotal + refundTotal, // 순액 = 입금 - 환불
      records,
    };
  },
};
