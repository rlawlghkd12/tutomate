import { z } from 'zod';
import dayjs from 'dayjs';
import { supabase } from '../../config/supabase';
import type { ToolHandler } from '../types';

const schema = z.object({
  studentId: z.string(),
  period: z.enum(['month', 'quarter', 'year']).optional(),
  limit: z.number().int().min(1).max(100).optional().default(20),
});

export const getPaymentHistory: ToolHandler<typeof schema> = {
  name: 'getPaymentHistory',
  description: '수강생의 결제 이력. period로 최근 기간 필터링 가능.',
  schema,
  async execute({ studentId, period, limit }, ctx) {
    if (!supabase) throw new Error('Supabase 미설정');
    let q = supabase
      .from('payment_records')
      .select('id, paid_at, amount, payment_method, notes')
      .eq('student_id', studentId)
      .eq('org_id', ctx.orgId)
      .order('paid_at', { ascending: false })
      .limit(limit);

    if (period) {
      const since = dayjs().subtract(1, period).format('YYYY-MM-DD');
      q = q.gte('paid_at', since);
    }
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return { payments: data ?? [] };
  },
};
