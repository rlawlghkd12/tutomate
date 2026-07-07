import { z } from 'zod';
import { supabase } from '../../config/supabase';
import type { ToolHandler } from '../types';

const schema = z.object({
  // 이름이 이 문자열로 시작하는 학생만 (예: "김" → 김씨 성).
  startsWith: z.string().optional(),
  // 이름에 이 문자열이 포함된 학생만.
  contains: z.string().optional(),
});

/**
 * 수강생 "수"를 정확히 센다. searchStudent는 목록을 최대 50개만 반환해 카운트가 부정확하므로,
 * "몇 명?" 류 질문은 이 도구를 써야 한다(head+count로 행을 안 가져오고 개수만 조회 → 토큰도 절약).
 */
export const countStudents: ToolHandler<typeof schema> = {
  name: 'countStudents',
  description:
    '수강생 수를 정확히 센다. startsWith(이름이 …로 시작)·contains(이름에 … 포함)로 거를 수 있고, 인자 없으면 전체 수강생 수. "○○로 시작하는 학생 몇 명?", "김씨 몇 명?" 같은 카운트 질문에 사용. (searchStudent는 목록·최대 50개라 카운트가 부정확하니 개수엔 이 도구를 쓸 것)',
  schema,
  async execute(args, _ctx) {
    if (!supabase) throw new Error('Supabase 미설정');
    let q = supabase.from('students').select('id', { count: 'exact', head: true });
    if (args.startsWith) q = q.ilike('name', `${args.startsWith}%`);
    if (args.contains) q = q.ilike('name', `%${args.contains}%`);
    const { count, error } = await q;
    if (error) throw new Error(error.message);
    return { count: count ?? 0 };
  },
};
