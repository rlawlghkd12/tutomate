import { describe, it, expect } from 'vitest';
import { buildPreview, type PreviewLookup, type PreviewRowInput } from '../buildPreview';
import type { DedupPayment } from '../../dedup/DedupChecker';

function makeLookup(existing?: Record<string, DedupPayment[]>): PreviewLookup {
  return {
    students: [
      { id: 's1', name: '김영희', phone: '010-1111-2222' },
      { id: 's2', name: '박철수', phone: '010-3333-4444' },
      { id: 's3', name: '김영희', phone: '010-5555-6666' },
    ],
    courses: [
      { id: 'c1', name: '중3수학', fee: 150000 },
      { id: 'c2', name: '중3영어', fee: 120000 },
    ],
    enrollments: [
      { id: 'e1', studentId: 's1', courseId: 'c1' },
      { id: 'e2', studentId: 's2', courseId: 'c2' },
      { id: 'e4', studentId: 's2', courseId: 'c1' },
      { id: 'e3', studentId: 's3', courseId: 'c2' },
    ],
    effectiveFeeByEnrollment: new Map([
      ['e1', 150000],
      ['e2', 120000],
      ['e4', 150000],
      ['e3', 120000],
    ]),
    existingByEnrollment: new Map(Object.entries(existing ?? {})),
  };
}

describe('buildPreview (결정론)', () => {
  it('auto 매칭 + 기존결제 없음 → include', () => {
    const out = buildPreview([{ rowIndex: 0, name: '박철수', amount: 120000, paidAt: '2026-06-02' }], makeLookup());
    expect(out[0].matchStatus).toBe('auto');
    expect(out[0].enrollmentId).toBe('e2');
    expect(out[0].decision).toBe('include');
    expect(out[0].included).toBe(true);
  });

  it('정확중복 → excluded', () => {
    const lookup = makeLookup({ e2: [{ paidAt: '2026-06-02', amount: 120000 }] });
    const out = buildPreview([{ rowIndex: 0, name: '박철수', amount: 120000, paidAt: '2026-06-02' }], lookup);
    expect(out[0].dedup).toBe('exact');
    expect(out[0].decision).toBe('excluded');
    expect(out[0].included).toBe(false);
  });

  it('완납된 등록에 다른 날 재입금 → needsConfirm', () => {
    const lookup = makeLookup({ e2: [{ paidAt: '2026-06-02', amount: 120000 }] });
    const out = buildPreview([{ rowIndex: 0, name: '박철수', amount: 120000, paidAt: '2026-07-02' }], lookup);
    expect(out[0].dedup).toBe('periodComplete');
    expect(out[0].decision).toBe('needsConfirm');
    expect(out[0].included).toBe(false);
  });

  it('미매칭 → unmatched/excluded', () => {
    const out = buildPreview([{ rowIndex: 0, name: '홍길동', amount: 100000, paidAt: '2026-06-02' }], makeLookup());
    expect(out[0].matchStatus).toBe('unmatched');
    expect(out[0].included).toBe(false);
  });

  it('동명이인(ambiguous) → needsConfirm (자동추정 안 함, 후보 드롭다운용)', () => {
    const out = buildPreview([{ rowIndex: 0, name: '김영희', amount: 150000, paidAt: '2026-06-02' }], makeLookup());
    expect(out[0].matchStatus).toBe('needsConfirm');
    expect(out[0].candidates.length).toBeGreaterThan(1); // 후보가 있어 UI에서 고를 수 있음
  });

  it('선납 시나리오(김미영): 메모 "7월분" → Q3 등록 매칭 + 중복 아님 → include', () => {
    const lookup: PreviewLookup = {
      students: [{ id: 'm1', name: '김미영', phone: '010-9999-0000' }],
      courses: [{ id: 'cc', name: '중3수학', fee: 150000 }],
      enrollments: [
        { id: 'q2', studentId: 'm1', courseId: 'cc', quarter: '2026-Q2' },
        { id: 'q3', studentId: 'm1', courseId: 'cc', quarter: '2026-Q3' },
      ],
      effectiveFeeByEnrollment: new Map([['q2', 150000], ['q3', 150000]]),
      existingByEnrollment: new Map([['q2', [{ paidAt: '2026-04-05', amount: 150000 }]]]),
    };
    const out = buildPreview(
      [{ rowIndex: 0, name: '김미영', amount: 150000, paidAt: '2026-06-28', memo: '7월분' }],
      lookup,
    );
    expect(out[0].enrollmentId).toBe('q3'); // 7월 = Q3
    expect(out[0].quarter).toBe('2026-Q3');
    expect(out[0].dedup).toBe('none');
    expect(out[0].included).toBe(true);
  });

  it('합계 등 비결제 행 → unmatched/excluded + 명확한 사유', () => {
    const out = buildPreview([{ rowIndex: 0, name: '합계', amount: 270000, paidAt: '2026-06-30' }], makeLookup());
    expect(out[0].matchStatus).toBe('unmatched');
    expect(out[0].included).toBe(false);
    expect(out[0].reason).toContain('비결제');
  });

  it('이름에 공백이 섞여도 정규화 매칭', () => {
    const out = buildPreview([{ rowIndex: 0, name: '박 철수', amount: 120000, paidAt: '2026-06-02' }], makeLookup());
    expect(out[0].matchStatus).toBe('auto');
    expect(out[0].enrollmentId).toBe('e2');
  });

  it('paymentMethod가 previewRow로 전달된다 (selections 저장용)', () => {
    const out = buildPreview(
      [{ rowIndex: 0, name: '박철수', amount: 120000, paidAt: '2026-06-02', paymentMethod: 'transfer' }],
      makeLookup(),
    );
    expect(out[0].paymentMethod).toBe('transfer');
    expect(out[0].enrollmentId).toBe('e2');
  });

  it('배치 내 누적: 같은 파일에 동일 결제 2행 → 두 번째는 정확중복 제외', () => {
    const rows: PreviewRowInput[] = [
      { rowIndex: 0, name: '박철수', amount: 120000, paidAt: '2026-06-02' },
      { rowIndex: 1, name: '박철수', amount: 120000, paidAt: '2026-06-02' },
    ];
    const out = buildPreview(rows, makeLookup());
    expect(out[0].included).toBe(true);
    expect(out[1].dedup).toBe('exact');
    expect(out[1].included).toBe(false);
  });
});
