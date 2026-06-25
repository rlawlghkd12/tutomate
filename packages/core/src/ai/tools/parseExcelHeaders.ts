import { z } from 'zod';
import { parseExcel } from '../../excel/ExcelParser';
import { isBankStatementFormat } from '../bank/parseBankExcel';
import { sanitizeRow } from '../security/sanitize';
import type { ToolHandler } from '../types';

const schema = z.object({ fileId: z.string() });

export const parseExcelHeaders: ToolHandler<typeof schema> = {
  name: 'parseExcelHeaders',
  description: '첨부된 엑셀의 헤더와 샘플 3행을 읽습니다.',
  schema,
  async execute({ fileId }, ctx) {
    if (!ctx.fileStash) throw new Error('FileStash 비활성');
    const bytes = new Uint8Array(await ctx.fileStash.read(fileId));
    // 은행 거래내역 형식이면 일반 임포트로 처리하면 실패하므로 전용 분석으로 유도.
    if (isBankStatementFormat(bytes)) {
      return {
        kind: 'bank_statement',
        hint: '이 파일은 은행 거래내역(입금내역)입니다. 곧바로 analyzeBankDeposits를 호출하세요(parseExcelHeaders/mapColumns/previewImport/confirmImport 사용 금지). 사용자에게는 도구 이름을 말하지 말고 "분석 및 매칭을 진행합니다. 잠시만 기다려주세요."처럼만 안내하세요.',
      };
    }
    const parsed = parseExcel(bytes);
    return {
      headers: parsed.headers,
      // 샘플 셀 값은 LLM에 노출되므로 sanitize (prompt injection 방어)
      sample: parsed.rows.slice(0, 3).map(sanitizeRow),
      totalRows: parsed.rows.length,
    };
  },
};
