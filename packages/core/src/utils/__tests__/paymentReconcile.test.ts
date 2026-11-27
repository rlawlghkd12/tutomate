import { describe, it, expect } from 'vitest';
import { decidePaymentEdit, byLatest, findMethodFixTarget } from '../paymentReconcile';

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

describe('byLatest', () => {
  it('납부일이 늦은 것 먼저, 같은 날이면 나중에 입력한 것 먼저', () => {
    const recs = [
      { id: 'old', amount: 1, paidAt: '2026-10-01', createdAt: '2026-11-24T10:00:00+00:00' },
      { id: 'later-date', amount: 1, paidAt: '2026-10-15', createdAt: '2026-11-01T00:00:00Z' },
      { id: 'new', amount: 1, paidAt: '2026-10-01', createdAt: '2026-11-25T02:00:00Z' },
    ];
    expect([...recs].sort(byLatest).map((r) => r.id)).toEqual(['later-date', 'new', 'old']);
  });
});

describe('findMethodFixTarget', () => {
  const recs = [
    { id: 'a', amount: 30000, paidAt: '2026-10-01', createdAt: '2026-10-01T00:00:00Z', paymentMethod: 'cash' },
    { id: 'b', amount: 30000, paidAt: '2026-10-15', createdAt: '2026-10-15T00:00:00Z', paymentMethod: 'cash' },
    { id: 'r', amount: -30000, paidAt: '2026-11-01', createdAt: '2026-11-01T00:00:00Z', paymentMethod: 'cash' },
  ];

  it('분납: 최신 양수 기록의 결제수단이 다르면 그 기록 (환불은 제외)', () => {
    expect(findMethodFixTarget(recs, 'transfer')).toBe('b');
  });

  it('이미 같으면 null', () => {
    expect(findMethodFixTarget(recs, 'cash')).toBeNull();
  });

  it('양수 기록이 없으면 null', () => {
    expect(findMethodFixTarget([recs[2]], 'transfer')).toBeNull();
  });
});
