import { z } from 'zod';
import { supabase } from '../../config/supabase';
import type { ToolHandler } from '../types';

// 인자 없는 도구지만 빈 object 스키마 필요 (node-llama-cpp GBNF가 최상위 optional 거부)
const schema = z.object({});

export const getOrgStats: ToolHandler<typeof schema> = {
  name: 'getOrgStats',
  description:
    '조직 전체 요약 통계 — 총 수강생/강좌/활성 등록/이번 달 매출. "총 몇 명?", "전체 통계" 같은 질문에 사용.',
  schema,
  async execute(_args, ctx) {
    if (!supabase) throw new Error('Supabase 미설정');

    const [studentsRes, coursesRes, enrollmentsRes] = await Promise.all([
      supabase.from('students').select('id', { count: 'exact', head: true }).eq('org_id', ctx.orgId),
      supabase.from('courses').select('id', { count: 'exact', head: true }).eq('org_id', ctx.orgId),
      supabase
        .from('enrollments')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', ctx.orgId)
        .eq('status', 'active'),
    ]);

    const month = new Date().toISOString().slice(0, 7); // YYYY-MM
    const { data: pays } = await supabase
      .from('payment_records')
      .select('amount')
      .eq('org_id', ctx.orgId)
      .gte('paid_at', `${month}-01`)
      .lte('paid_at', `${month}-31`);

    return {
      totalStudents: studentsRes.count ?? 0,
      totalCourses: coursesRes.count ?? 0,
      activeEnrollments: enrollmentsRes.count ?? 0,
      currentMonth: month,
      currentMonthRevenue: (pays ?? []).reduce((s, p: any) => s + (p.amount ?? 0), 0),
      currentMonthPaymentCount: pays?.length ?? 0,
    };
  },
};
