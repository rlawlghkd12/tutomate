import { describe, it, expect } from 'vitest';
import { groupImportLogs, type ImportLogRow } from '../importHistory';

const row = (over: Partial<ImportLogRow> & { batchId?: string; meta?: any }): ImportLogRow => ({
  event_type: over.event_type ?? 'payment.import_add',
  entity_id: over.entity_id ?? 'r1',
  entity_label: over.entity_label ?? '임순자 — 생활도예',
  created_at: over.created_at ?? '2026-09-01T00:00:00Z',
  payload: { meta: over.meta ?? { batchId: over.batchId ?? 'b1', source: 'bank', amount: 80000, paidAt: '2026-09-01', kind: 'saved', enrollmentId: 'e1' } },
});

describe('groupImportLogs', () => {
  it('batchId로 묶고 항목을 채운다', () => {
    const batches = groupImportLogs([
      row({ entity_id: 'r1', batchId: 'b1' }),
      row({ entity_id: 'r2', batchId: 'b1', entity_label: '홍삼순 — 아침 요가', meta: { batchId: 'b1', source: 'bank', amount: 50000, paidAt: '2026-09-01', kind: 'saved', enrollmentId: 'e2' } }),
    ]);
    expect(batches).toHaveLength(1);
    expect(batches[0].batchId).toBe('b1');
    expect(batches[0].items).toHaveLength(2);
    expect(batches[0].items[0]).toMatchObject({ recordId: 'r1', studentName: '임순자', courseName: '생활도예', amount: 80000, undone: false });
  });

  it('import_undo가 있는 기록은 undone=true', () => {
    const batches = groupImportLogs([
      row({ entity_id: 'r1', batchId: 'b1' }),
      { event_type: 'payment.import_undo', entity_id: 'r1', entity_label: '임순자 — 생활도예', created_at: '2026-09-02T00:00:00Z', payload: { meta: { batchId: 'b1' } } },
    ]);
    expect(batches[0].items[0].undone).toBe(true);
  });

  it('여러 배치를 최근순으로 정렬', () => {
    const batches = groupImportLogs([
      row({ entity_id: 'r1', batchId: 'old', created_at: '2026-09-01T00:00:00Z', meta: { batchId: 'old', source: 'excel', amount: 1, paidAt: '2026-09-01', kind: 'saved', enrollmentId: 'e1' } }),
      row({ entity_id: 'r2', batchId: 'new', created_at: '2026-09-05T00:00:00Z', meta: { batchId: 'new', source: 'bank', amount: 2, paidAt: '2026-09-05', kind: 'saved', enrollmentId: 'e2' } }),
    ]);
    expect(batches.map((b) => b.batchId)).toEqual(['new', 'old']);
  });

  it('신규 등록 meta(createdEnrollmentId) 보존', () => {
    const batches = groupImportLogs([
      row({ entity_id: 'r1', batchId: 'b1', meta: { batchId: 'b1', source: 'bank', amount: 60000, paidAt: '2026-09-04', kind: 'enrolled', enrollmentId: 'e9', createdEnrollmentId: 'e9' } }),
    ]);
    expect(batches[0].items[0].createdEnrollmentId).toBe('e9');
    expect(batches[0].items[0].kind).toBe('enrolled');
  });

  it('batchId 없는 로그는 무시', () => {
    const batches = groupImportLogs([row({ meta: { source: 'bank', amount: 1, paidAt: 'x', kind: 'saved', enrollmentId: 'e1' } })]);
    expect(batches).toHaveLength(0);
  });
});
