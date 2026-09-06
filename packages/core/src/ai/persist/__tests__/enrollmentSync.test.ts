import { describe, it, expect } from 'vitest';
import { computeEnrollmentSync } from '../enrollmentSync';

describe('computeEnrollmentSync', () => {
  it('완납 → completed, remaining 0, 최근 납부일', () => {
    const r = computeEnrollmentSync(
      [
        { paidAt: '2026-06-02', amount: 100000 },
        { paidAt: '2026-06-20', amount: 50000 },
      ],
      150000,
      'pending',
    );
    expect(r.paid_amount).toBe(150000);
    expect(r.remaining_amount).toBe(0);
    expect(r.payment_status).toBe('completed');
    expect(r.paid_at).toBe('2026-06-20');
  });

  it('부분납부 → partial, remaining 잔액', () => {
    const r = computeEnrollmentSync([{ paidAt: '2026-06-02', amount: 50000 }], 150000, 'pending');
    expect(r.payment_status).toBe('partial');
    expect(r.remaining_amount).toBe(100000);
  });

  it('결제 없음 → pending', () => {
    const r = computeEnrollmentSync([], 150000, 'pending');
    expect(r.payment_status).toBe('pending');
    expect(r.paid_at).toBeNull();
  });

  it('포기(withdrawn)는 상태 미변경, 납부액·납부일만', () => {
    const r = computeEnrollmentSync([{ paidAt: '2026-06-02', amount: 30000 }], 150000, 'withdrawn');
    expect(r.payment_status).toBeUndefined();
    expect(r.paid_amount).toBe(30000);
    expect(r.remaining_amount).toBe(0);
    expect(r.paid_at).toBe('2026-06-02');
  });

  it('면제(exempt)도 상태 미변경', () => {
    const r = computeEnrollmentSync([{ paidAt: '2026-06-02', amount: 0 }], 150000, 'exempt');
    expect(r.payment_status).toBeUndefined();
  });

  it('할인 반영 effectiveFee로 완납 판정', () => {
    // 정가 20만이지만 effectiveFee 15만 전달 → 15만이면 완납
    const r = computeEnrollmentSync([{ paidAt: '2026-06-02', amount: 150000 }], 150000, 'partial');
    expect(r.payment_status).toBe('completed');
  });
});
