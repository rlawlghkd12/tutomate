import { z } from 'zod';
import { supabase } from '../../config/supabase';
import type { ToolHandler } from '../types';

const schema = z.object({
  // "2026-Q2" 형식. 지정 시 해당 분기만, 미지정 시 전체(활성).
  quarter: z.string().regex(/^\d{4}-Q[1-4]$/).optional(),
  classId: z.string().optional(),
});

/**
 * 수익 관리 페이지와 동일한 기준의 매출.
 * = enrollments.paid_amount 합 (payment_status가 withdrawn/exempt 가 아닌 등록).
 * payment_records(결제 거래/현금흐름)와 다른, 등록 기준 누적 납부액.
 */
export const getRevenue: ToolHandler<typeof schema> = {
  name: 'getRevenue',
  description:
    '수익 관리 페이지와 동일한 매출(등록별 누적 납부액 합). 분기(quarter, "2026-Q2")·강좌(classId)로 한정 가능. "매출/수익이 얼마" 질문에 사용. (결제 거래 내역은 getCoursePayments/getPaymentHistory)',
  schema,
  async execute({ quarter, classId }, _ctx) {
    if (!supabase) throw new Error('Supabase 미설정');

    let q = supabase
      .from('enrollments')
      .select('paid_amount, payment_status, quarter, course_id, courses(name, fee)')
      // 페이지와 동일: 탈퇴/면제 제외
      .neq('payment_status', 'withdrawn')
      .neq('payment_status', 'exempt');
    if (quarter) q = q.eq('quarter', quarter);
    if (classId) q = q.eq('course_id', classId);

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const rows = data ?? [];

    const byCourse = new Map<string, { courseId: string; courseName: string | null; studentCount: number; revenue: number; expected: number }>();
    for (const r of rows as any[]) {
      const key = r.course_id;
      const c = byCourse.get(key) ?? {
        courseId: key,
        courseName: r.courses?.name ?? null,
        studentCount: 0,
        revenue: 0,
        expected: 0,
      };
      c.studentCount += 1;
      c.revenue += r.paid_amount ?? 0;
      c.expected += r.courses?.fee ?? 0;
      byCourse.set(key, c);
    }
    const courses = [...byCourse.values()].map((c) => ({
      ...c,
      unpaid: Math.max(0, c.expected - c.revenue),
    }));

    const totalRevenue = rows.reduce((s: number, r: any) => s + (r.paid_amount ?? 0), 0);
    const expectedRevenue = rows.reduce((s: number, r: any) => s + (r.courses?.fee ?? 0), 0);

    return {
      quarter: quarter ?? null,
      totalRevenue,
      expectedRevenue,
      unpaid: Math.max(0, expectedRevenue - totalRevenue),
      courses,
    };
  },
};
