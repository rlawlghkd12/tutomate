import { z } from 'zod';
import dayjs from 'dayjs';
import { supabase } from '../../config/supabase';
import type { ToolHandler } from '../types';

const schema = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) });

export const getMonthlySummary: ToolHandler<typeof schema> = {
  name: 'getMonthlySummary',
  description: '해당 월의 매출/등록 요약 통계',
  schema,
  async execute({ month }, _ctx) {
    if (!supabase) throw new Error('Supabase 미설정');

    // 월 경계 = [월초, 다음달초) — 달마다 말일이 다르고 paid_at은 DATE라 'YYYY-MM-31' 고정은 무효 날짜/누락 발생
    const monthStart = `${month}-01`;
    const nextMonthStart = dayjs(monthStart).add(1, 'month').format('YYYY-MM-DD');

    const { data: pays, error: paysErr } = await supabase
      .from('payment_records')
      .select('amount')
      .gte('paid_at', monthStart)
      .lt('paid_at', nextMonthStart);
    if (paysErr) throw new Error(paysErr.message);
    const totalAmount = (pays ?? []).reduce((s, p: any) => s + (p.amount ?? 0), 0);

    const { data: enrolls, error: enrollErr } = await supabase
      .from('enrollments')
      .select('id')
      .gte('enrolled_at', monthStart)
      .lt('enrolled_at', nextMonthStart);
    if (enrollErr) throw new Error(enrollErr.message);
    const newEnrollments = enrolls?.length ?? 0;

    return {
      month,
      totalAmount,
      paymentCount: pays?.length ?? 0,
      newEnrollments,
    };
  },
};
