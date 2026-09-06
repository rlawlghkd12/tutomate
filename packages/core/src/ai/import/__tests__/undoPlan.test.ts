import { describe, it, expect } from 'vitest';
import { planUndo, toUndoTargets, type UndoState, type SavedItem } from '../undoPlan';

/** 헬퍼: 단일 기록이 정상 존재하는 기본 상태 */
function stateWith(
  recordId: string,
  enrollmentId: string,
  opts: Partial<{ amount: number; paidAt: string; exists: boolean; count: number; refund: boolean }> = {},
): UndoState {
  return {
    recordById: new Map([
      [recordId, { exists: opts.exists ?? true, amount: opts.amount ?? 150000, paidAt: opts.paidAt ?? '2026-06-03' }],
    ]),
    recordCountByEnrollment: new Map([[enrollmentId, opts.count ?? 1]]),
    hasRefundByEnrollment: new Map([[enrollmentId, opts.refund ?? false]]),
  };
}

const target = (over: Partial<ReturnType<typeof baseTarget>> = {}) => ({ ...baseTarget(), ...over });
function baseTarget() {
  return { recordId: 'r1', enrollmentId: 'e1', importedAmount: 150000, importedPaidAt: '2026-06-03' };
}

describe('planUndo — 되돌리기 정합성 판정', () => {
  it('임포트 그대로 존재 → delete (확인 불필요)', () => {
    const v = planUndo([target()], stateWith('r1', 'e1'))[0];
    expect(v).toEqual({ recordId: 'r1', action: 'delete' });
  });

  it('기록이 이미 삭제됨 → skip (무동작)', () => {
    const v = planUndo([target()], stateWith('r1', 'e1', { exists: false }))[0];
    expect(v.action).toBe('skip');
  });

  it('recordById에 아예 없음 → skip', () => {
    const state: UndoState = {
      recordById: new Map(),
      recordCountByEnrollment: new Map(),
      hasRefundByEnrollment: new Map(),
    };
    expect(planUndo([target()], state)[0].action).toBe('skip');
  });

  it('환불 기록이 걸린 등록 → blocked', () => {
    const v = planUndo([target()], stateWith('r1', 'e1', { refund: true }))[0];
    expect(v.action).toBe('blocked');
    expect(v.reason).toMatch(/환불/);
  });

  it('임포트 후 금액이 수정됨 → delete지만 확인 필요', () => {
    const v = planUndo([target()], stateWith('r1', 'e1', { amount: 120000 }))[0];
    expect(v.action).toBe('delete');
    expect(v.requiresConfirm).toBe(true);
    expect(v.reason).toMatch(/수정/);
  });

  it('임포트 후 날짜가 수정됨 → 확인 필요', () => {
    const v = planUndo([target()], stateWith('r1', 'e1', { paidAt: '2026-06-05' }))[0];
    expect(v.requiresConfirm).toBe(true);
  });

  it('신규 등록 + 유일 기록 → deleteWithEnrollment (확인 필요)', () => {
    const t = target({ createdEnrollmentId: 'e1' });
    const v = planUndo([t], stateWith('r1', 'e1', { count: 1 }))[0];
    expect(v.action).toBe('deleteWithEnrollment');
    expect(v.enrollmentId).toBe('e1');
    expect(v.requiresConfirm).toBe(true);
    expect(v.reason).toMatch(/수강 등록/);
  });

  it('신규 등록이지만 이후 다른 결제가 추가됨(2건) → 등록 유지, 기록만 delete', () => {
    const t = target({ createdEnrollmentId: 'e1' });
    const v = planUndo([t], stateWith('r1', 'e1', { count: 2 }))[0];
    expect(v.action).toBe('delete');
    expect(v.enrollmentId).toBeUndefined();
  });

  it('환불이 신규 등록보다 우선 차단된다', () => {
    const t = target({ createdEnrollmentId: 'e1' });
    const v = planUndo([t], stateWith('r1', 'e1', { count: 1, refund: true }))[0];
    expect(v.action).toBe('blocked');
  });

  it('배치 일부는 이미 취소됨(skip), 나머지는 delete', () => {
    const targets = [
      { recordId: 'r1', enrollmentId: 'e1', importedAmount: 100000, importedPaidAt: '2026-06-01' },
      { recordId: 'r2', enrollmentId: 'e2', importedAmount: 200000, importedPaidAt: '2026-06-02' },
    ];
    const state: UndoState = {
      recordById: new Map([
        ['r1', { exists: false, amount: 0, paidAt: '' }],
        ['r2', { exists: true, amount: 200000, paidAt: '2026-06-02' }],
      ]),
      recordCountByEnrollment: new Map([['e1', 0], ['e2', 1]]),
      hasRefundByEnrollment: new Map(),
    };
    const [a, b] = planUndo(targets, state);
    expect(a.action).toBe('skip');
    expect(b.action).toBe('delete');
  });
});

describe('toUndoTargets — SavedItem → UndoTarget', () => {
  it('스냅샷(금액·날짜)과 createdEnrollmentId를 옮긴다', () => {
    const items: SavedItem[] = [
      { recordId: 'r1', enrollmentId: 'e1', studentName: '홍길동', courseName: '태극권', amount: 150000, paidAt: '2026-06-03', kind: 'enrolled', createdEnrollmentId: 'e1' },
      { recordId: 'r2', enrollmentId: 'e2', studentName: '김영희', courseName: '합창', amount: 120000, paidAt: '2026-06-04', kind: 'saved' },
    ];
    const t = toUndoTargets(items);
    expect(t[0]).toEqual({ recordId: 'r1', enrollmentId: 'e1', importedAmount: 150000, importedPaidAt: '2026-06-03', createdEnrollmentId: 'e1' });
    expect(t[1]).toEqual({ recordId: 'r2', enrollmentId: 'e2', importedAmount: 120000, importedPaidAt: '2026-06-04' });
    expect((t[1] as any).createdEnrollmentId).toBeUndefined();
  });
});
