import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as XLSX from 'xlsx';

/**
 * confirmImport 비선택 결제 경로 통합 테스트 — Supabase를 인메모리로 모킹해
 * "파일 파싱 → 이름/전화 매칭 → 중복 판정 → payment_records insert → enrollment 동기화"의
 * 실제 도구 로직(그동안 타입체크만 되던 부분)을 end-to-end로 검증한다.
 */

// 인메모리 DB 상태 (테스트마다 리셋). vi.hoisted로 mock 팩토리에서 접근 가능하게.
const h = vi.hoisted(() => ({ db: {} as Record<string, any[]>, inserted: {} as Record<string, any[]>, updated: [] as any[] }));

vi.mock('../../../config/supabase', () => {
  const thenable = (rows: any[]) => {
    const p: any = Promise.resolve({ data: rows, error: null });
    p.in = (col: string, vals: any[]) =>
      Promise.resolve({ data: rows.filter((r: any) => vals.includes(r[col])), error: null });
    return p;
  };
  const client = {
    from(table: string) {
      return {
        select() {
          return thenable(h.db[table] ?? []);
        },
        insert(rows: any) {
          const arr = Array.isArray(rows) ? rows : [rows];
          return {
            select() {
              const base = h.db[table]?.length ?? 0;
              const withIds = arr.map((r: any, i: number) => ({ ...r, id: `${table}-new-${base + i}` }));
              h.inserted[table] = [...(h.inserted[table] ?? []), ...arr];
              h.db[table] = [...(h.db[table] ?? []), ...withIds];
              return Promise.resolve({ data: withIds.map((r: any) => ({ id: r.id })), error: null });
            },
          };
        },
        update(obj: any) {
          return {
            eq(col: string, val: any) {
              h.updated.push({ table, col, val, obj });
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
  };
  return { supabase: client };
});

import { confirmImport } from '../confirmImport';
import { previewImport } from '../previewImport';
import type { ToolContext, SmartCard } from '../types';

function xlsxBuffer(rows: unknown[][]): Uint8Array {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
}

const MAPPING = { 이름: 'name', 전화: 'phone', 금액: 'amount', 납부일: 'paymentDate' };

function ctxWith(buf: Uint8Array): ToolContext {
  return {
    orgId: 'org1',
    userId: 'u1',
    fileStash: { read: async () => buf },
  };
}

async function runConfirm(buf: Uint8Array) {
  return (await confirmImport.execute(
    { fileId: 'f1', mapping: MAPPING as any, kind: 'payments' },
    ctxWith(buf),
  )) as { status: string; added: number; duplicated: number; errors: number; unmatched: number };
}

beforeEach(() => {
  h.inserted = {};
  h.updated = [];
  h.db = {
    students: [
      { id: 's1', name: '김영희', phone: '01011112222' },
      { id: 's2', name: '박철수', phone: '01033334444' },
    ],
    enrollments: [
      { id: 'e1', student_id: 's1', course_id: 'c1', discount_amount: 0, quarter: null, payment_status: 'pending', courses: { name: '중3수학', fee: 150000 } },
      { id: 'e2', student_id: 's2', course_id: 'c2', discount_amount: 0, quarter: null, payment_status: 'pending', courses: { name: '중3영어', fee: 120000 } },
    ],
    payment_records: [],
  };
});

describe('confirmImport 통합 (payments, 비선택)', () => {
  it('전화 매칭 → payment_records insert + enrollment 동기화', async () => {
    const buf = xlsxBuffer([
      ['이름', '전화', '금액', '납부일'],
      ['김영희', '01011112222', 150000, '2026-06-02'],
    ]);
    const r = await runConfirm(buf);

    expect(r.added).toBe(1);
    expect(r.duplicated).toBe(0);
    expect(h.inserted.payment_records).toHaveLength(1);
    expect(h.inserted.payment_records[0]).toMatchObject({
      enrollment_id: 'e1',
      amount: 150000,
      paid_at: '2026-06-02',
      organization_id: 'org1',
    });
    // enrollment 동기화 호출됨 (완납 → completed)
    const upd = h.updated.find((u) => u.table === 'enrollments' && u.val === 'e1');
    expect(upd).toBeTruthy();
    expect(upd.obj.paid_amount).toBe(150000);
    expect(upd.obj.payment_status).toBe('completed');
  });

  it('이름 폴백: 전화 없어도 이름(공백 무시)으로 매칭', async () => {
    const buf = xlsxBuffer([
      ['이름', '전화', '금액', '납부일'],
      ['박 철수', '', 120000, '2026-06-05'],
    ]);
    const r = await runConfirm(buf);
    expect(r.added).toBe(1);
    expect(h.inserted.payment_records[0].enrollment_id).toBe('e2');
  });

  it('정확중복(기존과 동일 날짜·금액) → 저장 안 함, duplicated 카운트', async () => {
    h.db.payment_records = [{ enrollment_id: 'e1', paid_at: '2026-06-02', amount: 150000 }];
    const buf = xlsxBuffer([
      ['이름', '전화', '금액', '납부일'],
      ['김영희', '01011112222', 150000, '2026-06-02'],
    ]);
    const r = await runConfirm(buf);
    expect(r.added).toBe(0);
    expect(r.duplicated).toBe(1);
    expect(h.inserted.payment_records).toBeUndefined();
  });

  it('매칭되는 학생 없음 → unmatched, 저장 없음', async () => {
    const buf = xlsxBuffer([
      ['이름', '전화', '금액', '납부일'],
      ['홍길동', '01099998888', 100000, '2026-06-02'],
    ]);
    const r = await runConfirm(buf);
    expect(r.added).toBe(0);
    expect(r.unmatched).toBeGreaterThanOrEqual(1);
  });

  it('금액 콤마·날짜 슬래시 등 실무 표기도 정규화되어 매칭·저장', async () => {
    const buf = xlsxBuffer([
      ['이름', '전화', '금액', '납부일'],
      ['김영희', '01011112222', '150,000', '2026/6/2'], // 콤마 + 슬래시·한자리
    ]);
    const r = await runConfirm(buf);
    expect(r.added).toBe(1);
    expect(h.inserted.payment_records[0]).toMatchObject({
      enrollment_id: 'e1',
      amount: 150000, // 콤마 제거·숫자화
      paid_at: '2026-06-02', // YYYY-MM-DD 정규화
    });
  });

  it('부분납부 후 완납(같은 등록, 합계 ≤ 수강료) → 둘 다 저장', async () => {
    const buf = xlsxBuffer([
      ['이름', '전화', '금액', '납부일'],
      ['김영희', '01011112222', 50000, '2026-06-02'],
      ['김영희', '01011112222', 100000, '2026-06-20'], // 합계 15만 = 수강료
    ]);
    const r = await runConfirm(buf);
    expect(r.added).toBe(2); // 부분납부 2건 모두 정상
    expect(r.duplicated).toBe(0);
    const upd = h.updated.find((u) => u.table === 'enrollments' && u.val === 'e1');
    expect(upd.obj.paid_amount).toBe(150000);
    expect(upd.obj.payment_status).toBe('completed');
  });

  it('합계 등 비결제 행은 저장 대상 아님', async () => {
    const buf = xlsxBuffer([
      ['이름', '전화', '금액', '납부일'],
      ['김영희', '01011112222', 150000, '2026-06-02'],
      ['합계', '', 150000, '2026-06-30'],
    ]);
    const r = await runConfirm(buf);
    expect(r.added).toBe(1); // 김영희만
    expect(h.inserted.payment_records).toHaveLength(1);
  });
});

// ── 주 사용자 경로: selections 확정 ──────────────────────────────
async function runSelections(selections: any[]) {
  return (await confirmImport.execute(
    { fileId: 'f1', mapping: {} as any, kind: 'payments', selections },
    { orgId: 'org1', userId: 'u1', fileStash: { read: async () => new Uint8Array() } },
  )) as { status: string; added: number; duplicated: number; errors: number; unmatched: number };
}

describe('confirmImport 통합 (payments, selections 확정)', () => {
  it('선택 행 저장 + enrollment 동기화 + 비고/결제수단 보존', async () => {
    const r = await runSelections([
      { enrollmentId: 'e1', paidAt: '2026-06-02', amount: 150000, paymentMethod: 'transfer', notes: '7월분' },
    ]);
    expect(r.added).toBe(1);
    expect(h.inserted.payment_records[0]).toMatchObject({
      enrollment_id: 'e1',
      amount: 150000,
      payment_method: 'transfer',
      notes: '7월분',
    });
    const upd = h.updated.find((u) => u.table === 'enrollments' && u.val === 'e1');
    expect(upd?.obj.payment_status).toBe('completed');
  });

  it('정확중복 선택은 제외', async () => {
    h.db.payment_records = [{ enrollment_id: 'e1', paid_at: '2026-06-02', amount: 150000 }];
    const r = await runSelections([{ enrollmentId: 'e1', paidAt: '2026-06-02', amount: 150000 }]);
    expect(r.added).toBe(0);
    expect(r.duplicated).toBe(1);
  });

  it('org 밖(존재하지 않는) enrollmentId는 거부 → unmatched, 저장 안 함', async () => {
    const r = await runSelections([{ enrollmentId: 'other-org-e', paidAt: '2026-06-02', amount: 150000 }]);
    expect(r.added).toBe(0);
    expect(r.unmatched).toBe(1);
    expect(h.inserted.payment_records).toBeUndefined();
  });
});

// ── 학생 임포트 ──────────────────────────────────────────────────
const STUDENT_MAPPING = { 이름: 'name', 전화: 'phone', 생년월일: 'birthDate' };
async function runStudents(buf: Uint8Array) {
  return (await confirmImport.execute(
    { fileId: 'f1', mapping: STUDENT_MAPPING as any, kind: 'students' },
    ctxWith(buf),
  )) as { status: string; added: number; duplicated: number; errors: number };
}

describe('confirmImport 통합 (students)', () => {
  it('신규 학생 insert, DB 기존 전화는 중복 스킵', async () => {
    const buf = xlsxBuffer([
      ['이름', '전화', '생년월일'],
      ['김영희', '01011112222', '2010-01-01'], // DB에 이미 있음(s1)
      ['새학생', '01077778888', '2011-02-02'], // 신규
    ]);
    const r = await runStudents(buf);
    expect(r.added).toBe(1);
    expect(r.duplicated).toBe(1);
    expect(h.inserted.students).toHaveLength(1);
    expect(h.inserted.students[0]).toMatchObject({ name: '새학생', phone: '01077778888', organization_id: 'org1' });
  });

  it('파일 내 중복 전화(같은 전화 2행) → 1명만 생성', async () => {
    const buf = xlsxBuffer([
      ['이름', '전화', '생년월일'],
      ['새학생', '01077778888', '2011-02-02'],
      ['새학생중복', '01077778888', '2011-02-02'], // 같은 전화 — 중복
    ]);
    const r = await runStudents(buf);
    expect(r.added).toBe(1); // 파일 내 중복 제거
    expect(r.duplicated).toBe(1);
    expect(h.inserted.students).toHaveLength(1);
  });
});

describe('previewImport 통합 (payments 강화 미리보기)', () => {
  it('카드에 previewRows(매칭·중복 판정 반영)가 첨부된다', async () => {
    h.db.payment_records = [{ enrollment_id: 'e2', paid_at: '2026-06-01', amount: 120000 }]; // e2 완납
    const buf = xlsxBuffer([
      ['이름', '전화', '금액', '납부일'],
      ['김영희', '01011112222', 150000, '2026-06-02'], // e1 정상 → include
      ['박철수', '01033334444', 120000, '2026-06-10'], // e2 완납 → needsConfirm
    ]);
    let card: SmartCard | null = null;
    await previewImport.execute(
      { fileId: 'f1', mapping: MAPPING as any, kind: 'payments' },
      { orgId: 'org1', userId: 'u1', fileStash: { read: async () => buf }, emit: (c) => (card = c) },
    );
    expect(card).toBeTruthy();
    const c = card as any;
    expect(c.type).toBe('importPreview');
    expect(c.previewRows).toHaveLength(2);
    const kim = c.previewRows.find((r: any) => r.payerName === '김영희');
    const park = c.previewRows.find((r: any) => r.payerName === '박철수');
    expect(kim.matchStatus).toBe('auto');
    expect(kim.included).toBe(true);
    expect(park.dedup).toBe('periodComplete'); // 완납 → 확인 필요
    expect(park.included).toBe(false);
  });
});
