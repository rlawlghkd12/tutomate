import { z } from 'zod';
import dayjs from 'dayjs';
import { supabase } from '../../config/supabase';
import type { ToolHandler } from '../types';

const schema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
});

export const getUnpaidStudents: ToolHandler<typeof schema> = {
  name: 'getUnpaidStudents',
  description: '특정 월(미지정 시 이번 달)의 미납자 목록',
  schema,
  async execute({ month }, ctx) {
    if (!supabase) throw new Error('Supabase 미설정');
    const target = month ?? dayjs().format('YYYY-MM');
    const { data, error } = await supabase
      .from('monthly_payments')
      .select('student_id, status, students!inner(id, name, phone)')

      .eq('month', target)
      .in('status', ['pending', 'partial']);
    if (error) throw new Error(error.message);
    return { month: target, unpaid: data ?? [] };
  },
};
