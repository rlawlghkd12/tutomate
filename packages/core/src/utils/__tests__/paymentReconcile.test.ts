import { describe, it, expect } from 'vitest';
import { decidePaymentEdit } from '../paymentReconcile';

describe('decidePaymentEdit — 납부정보 변경 시 이력 반영 결정', () => {
  it('기존 기록 없음 → 새로 만든다(create)', () => {
    expect(decidePaymentEdit([], 150000)).toEqual({ kind: 'create' });
  });

  it('기존 양수 기록 1건 → 그 기록 수정(update) — 새 줄 추가 안 함(핵심)', () => {
    const op = decidePaymentEdit([{ id: 'r1', amount: 150000 }], 120000);
    expect(op).toEqual({ kind: 'update', recordId: 'r1' });
  });

  it('환불(음수)만 있고 양수 없음 → 새로 만든다(create)', () => {
    expect(decidePaymentEdit([{ id: 'r1', amount: -50000 }], 150000)).toEqual({ kind: 'create' });
  });

  it('환불 섞여 양수 1건 → 그 양수 기록 수정', () => {
    const op = decidePaymentEdit([{ id: 'r1', amount: 150000 }, { id: 'r2', amount: -30000 }], 120000);
    expect(op).toEqual({ kind: 'update', recordId: 'r1' });
  });

  it('분납 2건 이상 → 모호하므로 이력 손대지 않고 요약만(summaryOnly)', () => {
    const op = decidePaymentEdit([{ id: 'r1', amount: 75000 }, { id: 'r2', amount: 75000 }], 200000);
    expect(op).toEqual({ kind: 'summaryOnly' });
  });

  it('새 금액 0 이하(면제/취소) → 요약만(summaryOnly)', () => {
    expect(decidePaymentEdit([{ id: 'r1', amount: 150000 }], 0)).toEqual({ kind: 'summaryOnly' });
    expect(decidePaymentEdit([{ id: 'r1', amount: 150000 }], -100)).toEqual({ kind: 'summaryOnly' });
  });
});
