import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseExcel, decodeTextBuffer, detectHeaderRow } from '../ExcelParser';
import { normalizeRow } from '../DataNormalizer';

function buildBuffer(rows: unknown[][]): Uint8Array {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
}

function buildMultiSheet(sheets: { name: string; rows: unknown[][] }[]): Uint8Array {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s.rows), s.name);
  }
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

  it('엑셀 날짜형 셀(Date)이 시리얼 숫자로 깨지지 않고 결제일로 정규화된다', () => {
    // 실제 엑셀에서 결제일 칸을 날짜로 입력하면 날짜형 셀이 된다. cellDates로 Date로 받아
    // 정상 파싱되어야 한다(과거엔 45xxx 시리얼 → 날짜 파싱 실패 → 행 통째 제외 버그).
    const ws = XLSX.utils.aoa_to_sheet(
      [
        ['이름', '금액', '결제일'],
        ['홍길동', 150000, new Date(2026, 2, 2)], // 월은 0-based → 2026-03-02
      ],
      { cellDates: true },
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const buf = new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));

    const parsed = parseExcel(buf);
    const norm = normalizeRow(parsed.rows[0], { 이름: 'name', 금액: 'amount', 결제일: 'paymentDate' });
    expect(norm.errors).toHaveLength(0);
    expect(norm.data.paymentDate).toBe('2026-03-02');
    expect(norm.data.amount).toBe(150000);
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

  it('UTF-8 CSV(한글) 파싱', () => {
    const csv = new TextEncoder().encode('이름,금액\n김영희,150000\n');
    const result = parseExcel(csv);
    expect(result.headers).toEqual(['이름', '금액']);
    expect(result.rows[0]).toEqual({ '이름': '김영희', '금액': 150000 });
  });

  it('UTF-8 BOM CSV → BOM 제거 후 파싱', () => {
    const body = new TextEncoder().encode('이름,금액\n박철수,120000\n');
    const csv = new Uint8Array([0xef, 0xbb, 0xbf, ...body]);
    const result = parseExcel(csv);
    expect(result.headers[0]).toBe('이름'); // BOM이 헤더 앞에 붙지 않음
    expect(result.rows[0]).toEqual({ '이름': '박철수', '금액': 120000 });
  });

  it('제목/안내행이 위에 있어도 헤더 자동 탐지', () => {
    const buf = buildBuffer([
      ['○○학원 3월 수강료 입금현황', '', ''],
      ['이름', '금액', '납부일'],
      ['김영희', 150000, '3/2'],
      ['박철수', 120000, '3/3'],
    ]);
    const result = parseExcel(buf);
    expect(result.headers).toEqual(['이름', '금액', '납부일']);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toEqual({ '이름': '김영희', '금액': 150000, '납부일': '3/2' });
  });

  it('헤더 중간에 빈 셀이 있어도 열 인덱스 정렬 유지(오매핑 방지)', () => {
    const buf = buildBuffer([
      ['이름', '', '전화번호', '금액'], // B열이 빈 헤더(스페이서)
      ['김철수', '', '010-1234-5678', 50000],
    ]);
    const result = parseExcel(buf);
    expect(result.headers).toEqual(['이름', '전화번호', '금액']);
    // 전화번호는 원래 3번째 열, 금액은 4번째 열 — 밀리지 않아야 한다
    expect(result.rows[0]).toEqual({
      '이름': '김철수',
      '전화번호': '010-1234-5678',
      '금액': 50000,
    });
  });

  it('다중 시트 — 안내 시트를 건너뛰고 데이터 시트 선택', () => {
    const buf = buildMultiSheet([
      { name: '안내', rows: [['이 파일 사용법'], ['문의: 학원']] },
      { name: '명단', rows: [['이름', '금액', '납부일'], ['김영희', 150000, '3/2']] },
    ]);
    const result = parseExcel(buf);
    expect(result.headers).toEqual(['이름', '금액', '납부일']);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toEqual({ '이름': '김영희', '금액': 150000, '납부일': '3/2' });
  });
});

describe('detectHeaderRow', () => {
  it('도메인 키워드가 가장 많은 행을 헤더로', () => {
    expect(
      detectHeaderRow([
        ['공지', '', ''],
        ['이름', '연락처', '금액'],
        ['홍길동', '010', 1000],
      ]),
    ).toBe(1);
  });
  it('키워드 없으면 첫 비어있지 않은 행(2칸 이상)으로 폴백', () => {
    expect(detectHeaderRow([['a', 'b'], ['c', 'd']])).toBe(0);
  });
  it('한 칸짜리 제목행은 헤더 후보에서 제외', () => {
    expect(detectHeaderRow([['제목만'], ['이름', '금액'], ['x', 1]])).toBe(1);
  });
});

describe('decodeTextBuffer 인코딩 감지', () => {
  it('EUC-KR(cp949) 한글 바이트를 올바로 디코드', () => {
    // "가"(0xB0A1) "\n" "나"(0xB3AA)
    const euckr = new Uint8Array([0xb0, 0xa1, 0x0a, 0xb3, 0xaa]);
    expect(decodeTextBuffer(euckr)).toBe('가\n나');
  });

  it('UTF-8 한글은 그대로', () => {
    const utf8 = new TextEncoder().encode('이름');
    expect(decodeTextBuffer(utf8)).toBe('이름');
  });

  it('UTF-8 BOM 제거', () => {
    const body = new TextEncoder().encode('금액');
    expect(decodeTextBuffer(new Uint8Array([0xef, 0xbb, 0xbf, ...body]))).toBe('금액');
  });
});
