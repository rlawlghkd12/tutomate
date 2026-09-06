import { describe, it, expect } from 'vitest';
import { resolveSelectionInserts } from '../resolveSelections';
import type { DedupPayment } from '../../dedup/DedupChecker';

const map = (o: Record<string, DedupPayment[]>) => new Map(Object.entries(o));

describe('resolveSelectionInserts', () => {
  it('기존과 정확중복인 선택은 제외', () => {
    const r = resolveSelectionInserts(
      [{ enrollmentId: 'e1', paidAt: '2026-06-02', amount: 150000 }],
      map({ e1: [{ paidAt: '2026-06-02', amount: 150000 }] }),
    );
    expect(r.inserts).toHaveLength(0);
    expect(r.duplicated).toBe(1);
  });

  it('기존과 다르면 저장(완납/초과여도 사용자 선택 존중)', () => {
    const r = resolveSelectionInserts(
      [{ enrollmentId: 'e1', paidAt: '2026-07-02', amount: 150000 }],
      map({ e1: [{ paidAt: '2026-06-02', amount: 150000 }] }), // 이미 완납이지만 사용자가 선택
    );
    expect(r.inserts).toHaveLength(1);
    expect(r.duplicated).toBe(0);
  });

  it('배치 내 동일 선택 2건 → 두 번째는 정확중복 제외', () => {
    const r = resolveSelectionInserts(
      [
        { enrollmentId: 'e1', paidAt: '2026-06-02', amount: 50000 },
        { enrollmentId: 'e1', paidAt: '2026-06-02', amount: 50000 },
      ],
      map({}),
    );
    expect(r.inserts).toHaveLength(1);
    expect(r.duplicated).toBe(1);
  });

  it('원본 existing 맵을 변경하지 않는다', () => {
    const existing = map({ e1: [{ paidAt: '2026-06-02', amount: 50000 }] });
    resolveSelectionInserts([{ enrollmentId: 'e1', paidAt: '2026-06-10', amount: 50000 }], existing);
    expect(existing.get('e1')).toHaveLength(1); // 누적이 원본에 반영되지 않음
  });

  it('paymentMethod 등 추가 필드를 보존', () => {
    const r = resolveSelectionInserts(
      [{ enrollmentId: 'e1', paidAt: '2026-06-02', amount: 50000, paymentMethod: 'transfer' as const }],
      map({}),
    );
    expect(r.inserts[0].paymentMethod).toBe('transfer');
  });
});
