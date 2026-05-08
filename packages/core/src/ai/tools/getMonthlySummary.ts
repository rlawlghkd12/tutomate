import { z } from 'zod';
import { supabase } from '../../config/supabase';
import type { ToolHandler } from '../types';

const schema = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) });

export const getMonthlySummary: ToolHandler<typeof schema> = {
  name: 'getMonthlySummary',
  description: '해당 월의 매출/등록 요약 통계',
  schema,
  async execute({ month }, _ctx) {
    if (!supabase) throw new Error('Supabase 미설정');
    const { data: pays } = await supabase
      .from('payment_records')
      .select('amount')

      .gte('paid_at', `${month}-01`)
      .lte('paid_at', `${month}-31`);
    const totalAmount = (pays ?? []).reduce(
      (s, p: any) => s + (p.amount ?? 0),
      0,
    );

    const { data: enrolls } = await supabase
      .from('enrollments')
      .select('id')

      .gte('started_at', `${month}-01`)
      .lte('started_at', `${month}-31`);
    const newEnrollments = enrolls?.length ?? 0;

    return {
      month,
      totalAmount,
      paymentCount: pays?.length ?? 0,
      newEnrollments,
    };
  },
};
