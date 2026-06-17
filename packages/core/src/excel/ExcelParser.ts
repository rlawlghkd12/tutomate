import * as XLSX from 'xlsx';
import type { ParsedExcel } from './types';

export function parseExcel(buffer: Uint8Array): ParsedExcel {
  const wb = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = wb.SheetNames[0];
  if (!firstSheetName) {
    throw new Error('엑셀 파일에 시트가 없습니다.');
  }
  const ws = wb.Sheets[firstSheetName];
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });

  if (aoa.length === 0) {
    throw new Error('엑셀 파일이 비어있습니다. 첫 행에 헤더가 있어야 합니다.');
  }

  const headers = (aoa[0] as unknown[])
    .map((h) => String(h ?? '').trim())
    .filter((h) => h.length > 0);

  if (headers.length === 0) {
    throw new Error('엑셀 첫 행에서 헤더를 찾을 수 없습니다.');
  }

  const rows: Record<string, unknown>[] = [];
  for (let i = 1; i < aoa.length; i++) {
    const row = aoa[i] as unknown[];
    if (!row || row.every((c) => c === '' || c == null)) continue;
    const obj: Record<string, unknown> = {};
    headers.forEach((h, idx) => {
      obj[h] = row[idx] ?? '';
    });
    rows.push(obj);
  }
  return { headers, rows };
}
