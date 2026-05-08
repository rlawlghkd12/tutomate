import { z } from 'zod';
import { parseExcel } from '../../excel/ExcelParser';
import { sanitizeRow } from '../security/sanitize';
import type { ToolHandler } from '../types';

const schema = z.object({ fileId: z.string() });

export const parseExcelHeaders: ToolHandler<typeof schema> = {
  name: 'parseExcelHeaders',
  description: '첨부된 엑셀의 헤더와 샘플 3행을 읽습니다.',
  schema,
  async execute({ fileId }, ctx) {
    if (!ctx.fileStash) throw new Error('FileStash 비활성');
    const buf = await ctx.fileStash.read(fileId);
    const parsed = parseExcel(new Uint8Array(buf));
    return {
      headers: parsed.headers,
      // 샘플 셀 값은 LLM에 노출되므로 sanitize (prompt injection 방어)
      sample: parsed.rows.slice(0, 3).map(sanitizeRow),
      totalRows: parsed.rows.length,
    };
  },
};
