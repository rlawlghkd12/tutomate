import { describe, it, expect } from 'vitest';
import { buildImportLogEntries, buildUndoLogEntries } from '../importAudit';
import type { SavedItem } from '../undoPlan';

const items: SavedItem[] = [
  { recordId: 'r1', enrollmentId: 'e1', studentName: '임순자', courseName: '생활도예', amount: 80000, paidAt: '2026-09-01', kind: 'saved' },
  { recordId: 'r2', enrollmentId: 'e2', studentName: '김라온', courseName: '합창', amount: 60000, paidAt: '2026-09-04', kind: 'enrolled', createdEnrollmentId: 'e2' },
  { recordId: 'r3', enrollmentId: 'e3', studentName: '박순희', courseName: '한국무용', amount: -20000, paidAt: '2026-09-05', kind: 'refunded' },
];
const meta = { orgId: 'org1', userId: 'u1', batchId: 'b1', source: 'bank' as const };

describe('buildImportLogEntries', () => {
  it('건별로 event_logs 행을 만든다 (org·actor·batchId 포함)', () => {
    const rows = buildImportLogEntries(items, meta);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      organization_id: 'org1',
      actor_user_id: 'u1',
      actor_label: 'AI 임포트',
      event_type: 'payment.import_add',
      entity_type: 'payment_record',
      entity_id: 'r1',
      entity_label: '임순자 — 생활도예',
    });
    expect((rows[0].payload as any).meta.batchId).toBe('b1');
    expect((rows[0].payload as any).meta.source).toBe('bank');
  });

  it('신규 등록 건은 createdEnrollmentId를 meta에 남긴다', () => {
    const rows = buildImportLogEntries(items, meta);
    expect((rows[1].payload as any).meta.createdEnrollmentId).toBe('e2');
  });

  it('환불 건은 event_type이 payment.import_refund', () => {
    const rows = buildImportLogEntries(items, meta);
    expect(rows[2].event_type).toBe('payment.import_refund');
  });

  it('userId 없으면 actor_user_id는 null', () => {
    const rows = buildImportLogEntries([items[0]], { orgId: 'org1', batchId: 'b1', source: 'excel' });
    expect(rows[0].actor_user_id).toBeNull();
  });
});

describe('buildUndoLogEntries', () => {
  it('되돌리기 이벤트(payment.import_undo)를 만든다', () => {
    const rows = buildUndoLogEntries([items[0]], meta);
    expect(rows[0].event_type).toBe('payment.import_undo');
    expect(rows[0].actor_label).toBe('AI 임포트 되돌리기');
    expect((rows[0].payload as any).meta.batchId).toBe('b1');
  });
});
