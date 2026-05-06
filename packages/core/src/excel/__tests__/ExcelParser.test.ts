import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseExcel } from '../ExcelParser';

function buildBuffer(rows: unknown[][]): Uint8Array {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
}

describe('parseExcel', () => {
  it('헤더 + 데이터 행 정상 파싱', () => {
    const buf = buildBuffer([
      ['이름', '연락처'],
      ['홍길동', '01012345678'],
      ['김민준', '01098765432'],
    ]);
    const result = parseExcel(buf);
    expect(result.headers).toEqual(['이름', '연락처']);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toEqual({ '이름': '홍길동', '연락처': '01012345678' });
  });

  it('빈 시트 → 에러', () => {
    const buf = buildBuffer([]);
    expect(() => parseExcel(buf)).toThrow(/헤더|비어/);
  });

  it('헤더 행만 있는 경우 → rows 빈 배열', () => {
    const buf = buildBuffer([['이름', '연락처']]);
    const result = parseExcel(buf);
    expect(result.rows).toEqual([]);
  });

  it('빈 행은 스킵', () => {
    const buf = buildBuffer([
      ['이름'],
      ['홍길동'],
      [''],
      ['김민준'],
    ]);
    const result = parseExcel(buf);
    expect(result.rows).toHaveLength(2);
  });
});
