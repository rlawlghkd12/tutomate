import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseBankExcel, isBankStatementFormat, readBankSheetRows, resolveColumnsFromRoles } from '../parseBankExcel';

/** aoa → xlsx 버퍼 */
function buf(rows: unknown[][]): Uint8Array {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
}

describe('parseBankExcel — 은행별 컬럼 차이 대응', () => {
  it('기본형(거래일시/내용/출금/입금/적요/비고)', () => {
    const r = parseBankExcel(
      buf([
        ['거래일시', '내용', '출금', '입금', '적요', '비고'],
        ['2026.05.04 13:35:39', '합창최하늘', '', '60000', '인터넷', ''],
        ['2026.05.05 09:00:00', '환불', '20000', '', 'ATM', ''],
      ]),
    );
    expect(r.deposits).toHaveLength(1);
    expect(r.deposits[0]).toMatchObject({ payerName: '합창최하늘', amount: 60000, method: '인터넷' });
    expect(r.withdrawals).toHaveLength(1);
    expect(r.withdrawals[0].amount).toBe(20000);
  });

  it('맡기신/찾으신금액 + 보낸분 + 제목·조회기간 헤더 위(국민·우리 계열)', () => {
    const r = parseBankExcel(
      buf([
        ['○○은행 거래내역 조회'],
        ['조회기간 : 2026.05.01 ~ 2026.05.31'],
        ['거래일자', '보낸분', '찾으신금액', '맡기신금액', '거래후잔액'],
        ['2026.05.10', '김나래', '', '60000', '160000'],
        ['2026.05.11', '', '30000', '', '130000'],
      ]),
    );
    expect(r.deposits).toHaveLength(1);
    expect(r.deposits[0]).toMatchObject({ payerName: '김나래', amount: 60000 });
    expect(r.withdrawals).toHaveLength(1);
    expect(r.withdrawals[0].amount).toBe(30000);
    expect(r.period).toBe('2026.05.01 ~ 2026.05.31');
  });

  it('컬럼 순서가 달라도 이름으로 찾는다 + 거래기록사항(농협 계열)', () => {
    const r = parseBankExcel(
      buf([
        ['입금액', '거래일자', '거래기록사항', '출금액'],
        ['60000', '2026.05.12', '드럼주차오', ''],
      ]),
    );
    expect(r.deposits).toHaveLength(1);
    expect(r.deposits[0]).toMatchObject({ payerName: '드럼주차오', amount: 60000 });
  });

  it('금액 1컬럼 + 방향(구분) 컬럼(카카오/토스 계열)', () => {
    const r = parseBankExcel(
      buf([
        ['거래일시', '내용', '거래금액', '구분'],
        ['2026.06.01', '곽가온 합창', '60000', '입금'],
        ['2026.06.02', '환불건', '50000', '출금'],
      ]),
    );
    expect(r.deposits).toHaveLength(1);
    expect(r.deposits[0]).toMatchObject({ payerName: '곽가온 합창', amount: 60000 });
    expect(r.withdrawals).toHaveLength(1);
    expect(r.withdrawals[0].amount).toBe(50000);
  });

  it('콤마·원 표기 금액도 숫자로 파싱', () => {
    const r = parseBankExcel(
      buf([
        ['거래일자', '내용', '입금액'],
        ['2026.06.03', '김남희', '60,000원'],
      ]),
    );
    expect(r.deposits[0].amount).toBe(60000);
  });

  it('인식 못 하는 양식은 조용히 틀리지 않고 명확히 실패(안전)', () => {
    expect(() => parseBankExcel(buf([['제목', '설명'], ['a', 'b']]))).toThrow(/인식하지 못/);
  });

  it('사전으로 못 잡는 새 양식도, 명시적 매핑(LLM/수동 폴백)을 주면 파싱된다', () => {
    // 헤더가 사전에 없는 이름(영문 등) → 자동 인식 실패. LLM/수동이 역할 매핑을 주면 파싱.
    const b = buf([
      ['TxnDate', 'Sender', 'CreditAmt', 'DebitAmt'],
      ['2026.05.20', '오한기 시니어', '90000', ''],
    ]);
    // 자동은 실패
    expect(() => parseBankExcel(b)).toThrow(/인식하지 못/);
    // 헤더 후보를 뽑아(→ LLM에 전달) 매핑을 받은 뒤 재파싱
    const rows = readBankSheetRows(b);
    expect(rows[0]).toEqual(['TxnDate', 'Sender', 'CreditAmt', 'DebitAmt']);
    const r = parseBankExcel(b, {
      headerRow: 0,
      roles: { date: 'TxnDate', name: 'Sender', in: 'CreditAmt', out: 'DebitAmt' },
    });
    expect(r.deposits).toHaveLength(1);
    expect(r.deposits[0]).toMatchObject({ payerName: '오한기 시니어', amount: 90000 });
  });

  it('resolveColumnsFromRoles: 실제 없는 헤더를 지목하거나 필수 역할 빠지면 null(안전)', () => {
    const header = ['TxnDate', 'Sender', 'CreditAmt'];
    expect(resolveColumnsFromRoles(header, { date: 'TxnDate', name: 'Sender', in: 'CreditAmt' })).not.toBeNull();
    // 금액 역할이 없음 → null
    expect(resolveColumnsFromRoles(header, { date: 'TxnDate', name: 'Sender' })).toBeNull();
    // 존재하지 않는 헤더 지목 → null
    expect(resolveColumnsFromRoles(header, { date: '없는칸', name: 'Sender', in: 'CreditAmt' })).toBeNull();
  });

  it('잘못된 매핑(엉뚱한 컬럼)이면 재파싱도 실패로 남아 조용히 저장되지 않는다', () => {
    const b = buf([
      ['TxnDate', 'Sender', 'CreditAmt'],
      ['2026.05.20', '오한기', '90000'],
    ]);
    // in 역할을 존재하지 않는 이름으로 → override 무효 → throw
    expect(() => parseBankExcel(b, { headerRow: 0, roles: { date: 'TxnDate', name: 'Sender', in: '없음' } })).toThrow(/인식하지 못/);
  });

  it('isBankStatementFormat: 거래내역이면 true, 학생 명부면 false', () => {
    expect(isBankStatementFormat(buf([['거래일자', '보낸분', '맡기신금액'], ['2026.05.10', '김나래', '60000']]))).toBe(true);
    expect(isBankStatementFormat(buf([['이름', '연락처', '금액', '결제일'], ['홍길동', '01012345678', '150000', '2026-05-01']]))).toBe(false);
  });
});
