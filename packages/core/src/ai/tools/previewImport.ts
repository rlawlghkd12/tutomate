import { z } from 'zod';
import { parseExcel } from '../../excel/ExcelParser';
import { normalizeRow } from '../../excel/DataNormalizer';
import type { ToolHandler, SmartCard } from '../types';
import type { StandardField } from '../../excel/types';

const schema = z.object({
  fileId: z.string(),
  mapping: z.record(z.string(), z.string()),
  kind: z.enum(['students', 'payments']),
});

export const previewImport: ToolHandler<typeof schema> = {
  name: 'previewImport',
  description:
    '매핑을 적용한 정규화 결과 미리보기 (최대 50행 + 통계). UI에 importPreview 카드를 띄웁니다.',
  schema,
  async execute({ fileId, mapping, kind }, ctx) {
    if (!ctx.fileStash) throw new Error('FileStash 비활성');
    const buf = await ctx.fileStash.read(fileId);
    const parsed = parseExcel(new Uint8Array(buf));
    const typed = mapping as Record<string, StandardField>;

    const previewRows = parsed.rows.slice(0, 50).map((r) => normalizeRow(r, typed));
    const errorRows = previewRows.filter((p) => p.errors.length > 0).length;

    const card: SmartCard = {
      type: 'importPreview',
      fileId,
      mapping,
      kind,
      rows: previewRows.map((p) => ({
        data: p.data,
        errors: p.errors.map((e) => e.field),
      })),
      total: parsed.rows.length,
      errorRows,
    };
    ctx.emit?.(card);
    return { status: 'preview', total: parsed.rows.length, errorRows };
  },
};
