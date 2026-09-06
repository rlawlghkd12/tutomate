import { describe, it, expect } from 'vitest';
import { parsePaymentMethod } from '../index';

describe('parsePaymentMethod', () => {
  it('한국어 표기 → enum', () => {
    expect(parsePaymentMethod('현금')).toBe('cash');
    expect(parsePaymentMethod('카드')).toBe('card');
    expect(parsePaymentMethod('신용카드')).toBe('card');
    expect(parsePaymentMethod('체크카드')).toBe('card');
    expect(parsePaymentMethod('계좌이체')).toBe('transfer');
    expect(parsePaymentMethod('이체')).toBe('transfer');
    expect(parsePaymentMethod('무통장입금')).toBe('transfer');
  });
  it('영문 표기 → enum', () => {
    expect(parsePaymentMethod('cash')).toBe('cash');
    expect(parsePaymentMethod('Card')).toBe('card');
    expect(parsePaymentMethod('TRANSFER')).toBe('transfer');
  });
  it('공백 무시', () => {
    expect(parsePaymentMethod(' 계좌 이체 ')).toBe('transfer');
  });
  it('인식 실패·빈값 → undefined', () => {
    expect(parsePaymentMethod('')).toBeUndefined();
    expect(parsePaymentMethod(undefined)).toBeUndefined();
    expect(parsePaymentMethod('기타')).toBeUndefined();
  });
});
