import { describe, it, expect } from 'vitest';
import { isNonPaymentRowName } from '../rowFilter';

describe('isNonPaymentRowName', () => {
  it('합계·소계 등은 비결제 행', () => {
    expect(isNonPaymentRowName('합계')).toBe(true);
    expect(isNonPaymentRowName('소 계')).toBe(true); // 공백 무시
    expect(isNonPaymentRowName('총계')).toBe(true);
    expect(isNonPaymentRowName('합계금액')).toBe(true); // 시작 일치
    expect(isNonPaymentRowName('Total')).toBe(true);
    expect(isNonPaymentRowName('이월')).toBe(true);
  });
  it("'계' 1글자·영문 키워드는 정확일치만(오탐 방지)", () => {
    expect(isNonPaymentRowName('계')).toBe(true);
    expect(isNonPaymentRowName('계란')).toBe(false); // 한글 startsWith 대상 아님
    expect(isNonPaymentRowName('total')).toBe(true);
    expect(isNonPaymentRowName('sum')).toBe(true);
  });
  it('영문 실명은 오탐하지 않음 (Sumin·Total로 시작해도)', () => {
    expect(isNonPaymentRowName('Sumin')).toBe(false); // "sum"으로 시작하지만 실명
    expect(isNonPaymentRowName('SUMIN')).toBe(false);
    expect(isNonPaymentRowName('Sumire')).toBe(false);
    expect(isNonPaymentRowName('Totoro')).toBe(false);
  });
  it('일반 이름은 비결제 행 아님', () => {
    expect(isNonPaymentRowName('김영희')).toBe(false);
    expect(isNonPaymentRowName('박철수')).toBe(false);
    expect(isNonPaymentRowName('')).toBe(false);
    expect(isNonPaymentRowName(undefined)).toBe(false);
  });
});
