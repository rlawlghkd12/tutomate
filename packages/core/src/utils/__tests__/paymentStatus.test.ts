import { describe, it, expect } from 'vitest';
import { derivePaymentStatus } from '../paymentStatus';

describe('derivePaymentStatus — 납부 상태·잔여액 단일 계산 기준', () => {
  it('납부액 0 → 미납(pending), 잔여=실수강료', () => {
    expect(derivePaymentStatus(0, 150000)).toEqual({ paymentStatus: 'pending', remainingAmount: 150000 });
  });

  it('납부액 음수(순환불) → 미납(pending), 잔여는 실수강료보다 커진다', () => {
    // 기존 동작 그대로: remaining = max(0, 150000 - (-5000)) = 155000
    expect(derivePaymentStatus(-5000, 150000)).toEqual({ paymentStatus: 'pending', remainingAmount: 155000 });
  });

  it('일부만 납부 → 부분납부(partial), 잔여=차액', () => {
    expect(derivePaymentStatus(50000, 150000)).toEqual({ paymentStatus: 'partial', remainingAmount: 100000 });
  });

  it('정확히 완납 → 완납(completed), 잔여 0', () => {
    expect(derivePaymentStatus(150000, 150000)).toEqual({ paymentStatus: 'completed', remainingAmount: 0 });
  });

  it('초과 납부 → 완납(completed), 잔여는 음수가 아닌 0', () => {
    expect(derivePaymentStatus(200000, 150000)).toEqual({ paymentStatus: 'completed', remainingAmount: 0 });
  });

  it('할인으로 실수강료가 0이면 → 납부액 0이라도 완납은 아님(0 이하는 미납)', () => {
    // effectiveFee 0, paid 0 → paid<=0 이므로 pending (기존 동작 그대로 유지)
    expect(derivePaymentStatus(0, 0)).toEqual({ paymentStatus: 'pending', remainingAmount: 0 });
    // 실수강료 0인데 조금이라도 냈으면 완납(paid >= effectiveFee)
    expect(derivePaymentStatus(1, 0)).toEqual({ paymentStatus: 'completed', remainingAmount: 0 });
  });
});
