import { z } from 'zod';
import { supabase } from '../../config/supabase';
import type { ToolHandler } from '../types';

const schema = z.object({ studentId: z.string() });

export const getStudent: ToolHandler<typeof schema> = {
  name: 'getStudent',
  description: '특정 수강생의 상세 정보',
  schema,
  async execute({ studentId }, ctx) {
    if (!supabase) throw new Error('Supabase 미설정');
    const { data, error } = await supabase
      .from('students')
      .select('*')
      .eq('id', studentId)
      .eq('org_id', ctx.orgId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) {
      return { error: { code: 'not_found', message: '수강생을 찾을 수 없습니다.' } };
    }
    return { student: data };
  },
};
