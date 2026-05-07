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
    if (!ctx.orgId) {
      return {
        error: {
          code: 'no_org',
          message: '현재 로그인된 조직을 찾을 수 없습니다. 앱에 로그인되어 있는지 확인하세요.',
        },
      };
    }

    console.log('[getOrgStats] querying org_id=', ctx.orgId);

    const [studentsRes, coursesRes, enrollmentsRes] = await Promise.all([
      supabase.from('students').select('id', { count: 'exact', head: true }).eq('org_id', ctx.orgId),
      supabase.from('courses').select('id', { count: 'exact', head: true }).eq('org_id', ctx.orgId),
      supabase
        .from('enrollments')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', ctx.orgId)
        .eq('status', 'active'),
    ]);

    // 각 쿼리 결과 개별 출력 (어느 테이블이 막혔는지 식별)
    console.log('[getOrgStats] students:', { count: studentsRes.count, error: studentsRes.error });
    console.log('[getOrgStats] courses:', { count: coursesRes.count, error: coursesRes.error });
    console.log('[getOrgStats] enrollments:', { count: enrollmentsRes.count, error: enrollmentsRes.error });

    // 현재 supabase auth 상태도 같이 (인증 적용됐는지 검증용)
    const { data: authData } = await supabase.auth.getSession();
    console.log('[getOrgStats] auth state:', {
      hasSession: !!authData.session,
      userId: authData.session?.user?.id,
      expires_at: authData.session?.expires_at,
    });

    if (studentsRes.error || coursesRes.error || enrollmentsRes.error) {
      const err = studentsRes.error ?? coursesRes.error ?? enrollmentsRes.error;
      // Supabase Error 객체 — 모든 own prop 추출
      const errDump: Record<string, unknown> = {};
      if (err) {
        for (const k of Object.getOwnPropertyNames(err)) {
          errDump[k] = (err as any)[k];
        }
      }
      console.error('[getOrgStats] supabase error own-props:', JSON.stringify(errDump, null, 2));
      throw new Error(err?.message || (err as any)?.code || 'DB 조회 실패 — RLS 또는 인증 문제 가능');
    }

    const month = new Date().toISOString().slice(0, 7);
    const { data: pays, error: paysErr } = await supabase
      .from('payment_records')
      .select('amount')
      .eq('org_id', ctx.orgId)
      .gte('paid_at', `${month}-01`)
      .lte('paid_at', `${month}-31`);
    if (paysErr) console.warn('[getOrgStats] payments query error:', paysErr);

    const result = {
      orgId: ctx.orgId,
      totalStudents: studentsRes.count ?? 0,
      totalCourses: coursesRes.count ?? 0,
      activeEnrollments: enrollmentsRes.count ?? 0,
      currentMonth: month,
      currentMonthRevenue: (pays ?? []).reduce((s, p: any) => s + (p.amount ?? 0), 0),
      currentMonthPaymentCount: pays?.length ?? 0,
    };
    console.log('[getOrgStats] result:', result);
    return result;
  },
};
