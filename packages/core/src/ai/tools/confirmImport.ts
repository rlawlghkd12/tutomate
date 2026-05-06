import { z } from 'zod';
import { parseExcel } from '../../excel/ExcelParser';
import { normalizeRow } from '../../excel/DataNormalizer';
import { supabase } from '../../config/supabase';
import type { ToolHandler, SmartCard } from '../types';
import type { StandardField } from '../../excel/types';

const schema = z.object({
  fileId: z.string(),
  mapping: z.record(z.string(), z.string()),
  kind: z.enum(['students', 'payments']),
});

export const confirmImport: ToolHandler<typeof schema> = {
  name: 'confirmImport',
  description: '미리보기 확정. Supabase에 학생/결제 일괄 UPSERT.',
  schema,
  async execute({ fileId, mapping, kind }, ctx) {
    if (!ctx.fileStash) throw new Error('FileStash 비활성');
    if (!supabase) throw new Error('Supabase 미설정');
    const buf = await ctx.fileStash.read(fileId);
    const parsed = parseExcel(new Uint8Array(buf));
    const typed = mapping as Record<string, StandardField>;

    const normalized = parsed.rows.map((r) => normalizeRow(r, typed));
    const valid = normalized.filter((n) => n.errors.length === 0);
    const errors = normalized.length - valid.length;

    let added = 0;
    let duplicated = 0;

    if (kind === 'students') {
      const rows = valid
        .map((n) => ({
          org_id: ctx.orgId,
          name: n.data.name as string,
          phone: n.data.phone as string | undefined,
          birth_date: n.data.birthDate as string | undefined,
        }))
        .filter((r) => r.name);
      const { data, error } = await supabase
        .from('students')
        .upsert(rows, {
          onConflict: 'org_id,phone',
          ignoreDuplicates: false,
        })
        .select('id');
      if (error) throw new Error(error.message);
      added = data?.length ?? 0;
    } else {
      // payments: 학생 매칭 후 insert
      const phones = Array.from(
        new Set(valid.map((n) => n.data.phone).filter(Boolean)),
      ) as string[];
      const { data: students } = await supabase
        .from('students')
        .select('id, phone')
        .in('phone', phones)
        .eq('org_id', ctx.orgId);
      const phoneToId = new Map(
        (students ?? []).map((s: any) => [s.phone, s.id]),
      );

      const rows = valid
        .map((n) => ({
          org_id: ctx.orgId,
          student_id: phoneToId.get(n.data.phone as string),
          paid_at: n.data.paymentDate,
          amount: n.data.amount,
          payment_method: n.data.paymentMethod ?? 'cash',
        }))
        .filter((r) => r.student_id);

      duplicated = valid.length - rows.length;
      const { data, error } = await supabase
        .from('payment_records')
        .insert(rows)
        .select('id');
      if (error) throw new Error(error.message);
      added = data?.length ?? 0;
    }

    const card: SmartCard = {
      type: 'importResult',
      added,
      duplicated,
      errors,
    };
    ctx.emit?.(card);
    return { status: 'done', added, duplicated, errors };
  },
};
