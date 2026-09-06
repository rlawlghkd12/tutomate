import { describe, it, expect } from 'vitest';
import { checkDuplicate, FEE_TOLERANCE } from '../DedupChecker';

/**
 * DEV §9.1 골든셋 — 중복 판정은 돈 안전 직결이라 시나리오를 못 박는다.
 */
describe('DedupChecker.checkDuplicate — 골든셋', () => {
  it('① 정확 재업로드 → exact/exclude', () => {
    const r = checkDuplicate({
      effectiveFee: 150000,
      existing: [{ paidAt: '2026-06-02', amount: 150000 }],
      incoming: { paidAt: '2026-06-02', amount: 150000 },
    });
    expect(r.level).toBe('exact');
    expect(r.action).toBe('exclude');
  });

  it('② 같은 분기 다른 달 중복(완납 상태) → periodComplete/confirm', () => {
    const r = checkDuplicate({
      effectiveFee: 150000,
      existing: [{ paidAt: '2026-06-02', amount: 150000 }],
      incoming: { paidAt: '2026-07-02', amount: 150000 },
    });
    expect(r.level).toBe('periodComplete');
    expect(r.action).toBe('confirm');
  });

  it('③ 완납 후 추가 입금 → periodComplete/confirm', () => {
    const r = checkDuplicate({
      effectiveFee: 150000,
      existing: [{ paidAt: '2026-06-02', amount: 150000 }],
      incoming: { paidAt: '2026-06-20', amount: 50000 },
    });
    expect(r.action).toBe('confirm');
  });

  it('④ 부분납부(합계 ≤ 수강료) → none/include', () => {
    const r = checkDuplicate({
      effectiveFee: 150000,
      existing: [{ paidAt: '2026-06-02', amount: 50000 }],
      incoming: { paidAt: '2026-06-10', amount: 50000 },
    });
    expect(r.level).toBe('none');
    expect(r.action).toBe('include');
  });

  it('⑤ 다음 분기 선납(해당 enrollment 결제 없음) → none/include', () => {
    const r = checkDuplicate({
      effectiveFee: 150000,
      existing: [],
      incoming: { paidAt: '2026-06-28', amount: 150000 },
    });
    expect(r.level).toBe('none');
    expect(r.action).toBe('include');
  });

  it('⑥ 할인 반영 완납(effectiveFee 기준) → periodComplete/confirm', () => {
    // 정가 20만, 할인 5만 → effectiveFee 15만. 기존 15만 완납 + 1만 추가.
    const r = checkDuplicate({
      effectiveFee: 150000,
      existing: [{ paidAt: '2026-06-02', amount: 150000 }],
      incoming: { paidAt: '2026-06-15', amount: 10000 },
    });
    expect(r.action).toBe('confirm');
  });

  it('부분납부를 완납으로 채우는 정상 결제 → include', () => {
    const r = checkDuplicate({
      effectiveFee: 150000,
      existing: [{ paidAt: '2026-06-02', amount: 100000 }],
      incoming: { paidAt: '2026-06-10', amount: 50000 },
    });
    expect(r.action).toBe('include');
  });

  it('수수료 차감 경계(FEE_TOLERANCE 이내 부족)는 완납으로 간주 → confirm', () => {
    const r = checkDuplicate({
      effectiveFee: 150000,
      existing: [{ paidAt: '2026-06-02', amount: 150000 - FEE_TOLERANCE }],
      incoming: { paidAt: '2026-07-02', amount: 150000 },
    });
    expect(r.level).toBe('periodComplete');
  });

  it('exact가 완납/초과보다 우선한다', () => {
    const r = checkDuplicate({
      effectiveFee: 150000,
      existing: [{ paidAt: '2026-06-02', amount: 150000 }],
      incoming: { paidAt: '2026-06-02', amount: 150000 },
    });
    expect(r.level).toBe('exact');
  });
});
