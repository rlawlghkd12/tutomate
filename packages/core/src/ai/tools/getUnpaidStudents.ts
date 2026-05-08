import { z } from 'zod';
import dayjs from 'dayjs';
import { supabase } from '../../config/supabase';
import type { ToolHandler } from '../types';

const schema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
});

export const getUnpaidStudents: ToolHandler<typeof schema> = {
  name: 'getUnpaidStudents',
  description: '특정 월(미지정 시 이번 달)의 미납자 목록. monthly_payments.status="pending" 필터.',
  schema,
  async execute({ month }, _ctx) {
    if (!supabase) throw new Error('Supabase 미설정');
    const target = month ?? dayjs().format('YYYY-MM');

    const { data, error } = await supabase
      .from('monthly_payments')
      .select(
        'enrollment_id, status, amount, paid_at, ' +
          'enrollments!inner(student_id, course_id, students!inner(id, name, phone), courses(name))',
      )
      .eq('month', target)
      .eq('status', 'pending');
    if (error) throw new Error(error.message);

    const unpaid = (data ?? []).map((mp: any) => ({
      student_id: mp.enrollments?.student_id,
      student_name: mp.enrollments?.students?.name,
      phone: mp.enrollments?.students?.phone,
      course: mp.enrollments?.courses?.name,
      amount: mp.amount,
      status: mp.status,
    }));
    return { month: target, count: unpaid.length, unpaid };
  },
};
