import { z } from 'zod';
import { supabase } from '../../config/supabase';
import type { ToolHandler } from '../types';

const schema = z
  .object({
    name: z.string().optional(),
    phone: z.string().optional(),
  })
  .refine((v) => v.name || v.phone, {
    message: 'name 또는 phone 중 하나는 필수',
  });

export const searchStudent: ToolHandler<typeof schema> = {
  name: 'searchStudent',
  description: '이름 또는 전화번호 부분 일치로 수강생을 검색합니다.',
  schema,
  async execute(args, ctx) {
    if (!supabase) throw new Error('Supabase 미설정');
    let q = supabase
      .from('students')
      .select('id, name, phone')
      .eq('org_id', ctx.orgId)
      .limit(20);
    if (args.name) q = q.ilike('name', `%${args.name}%`);
    if (args.phone) q = q.ilike('phone', `%${args.phone.replace(/\D+/g, '')}%`);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return { students: data ?? [] };
  },
};
