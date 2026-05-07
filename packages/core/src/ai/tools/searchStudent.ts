import { z } from 'zod';
import { supabase } from '../../config/supabase';
import type { ToolHandler } from '../types';

const schema = z.object({
  name: z.string().optional(),
  phone: z.string().optional(),
  limit: z.number().int().min(1).max(200).optional().default(50),
});

export const searchStudent: ToolHandler<typeof schema> = {
  name: 'searchStudent',
  description: '수강생 검색. 이름/전화 부분 일치, 둘 다 없으면 전체 목록 반환(최대 limit개).',
  schema,
  async execute(args, ctx) {
    if (!supabase) throw new Error('Supabase 미설정');
    let q = supabase
      .from('students')
      .select('id, name, phone')

      .limit(args.limit ?? 50);
    if (args.name) q = q.ilike('name', `%${args.name}%`);
    if (args.phone) q = q.ilike('phone', `%${args.phone.replace(/\D+/g, '')}%`);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return { students: data ?? [] };
  },
};
