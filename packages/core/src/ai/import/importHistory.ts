/**
 * event_logs의 AI 임포트 이벤트를 '처리 내역' 화면용 배치 목록으로 묶는 순수 함수.
 * 참고: docs/PLAN-ai-import-history-undo.md (P5).
 *
 * import_add/import_refund 를 batchId로 묶고, 같은 기록에 import_undo가 있으면 undone 표시.
 */
import type { SavedItem } from './undoPlan';

/** event_logs 한 행(조회 결과에서 필요한 필드만). */
export interface ImportLogRow {
  event_type: string;
  entity_id: string | null;
  entity_label: string | null;
  created_at: string;
  payload: { meta?: Record<string, unknown> } | null;
}

export interface ImportHistoryItem extends SavedItem {
  /** 이미 되돌려진 건인가 (같은 recordId에 import_undo 존재) */
  undone: boolean;
}

export interface ImportBatch {
  batchId: string;
  source: string; // 'excel' | 'bank'
  createdAt: string;
  items: ImportHistoryItem[];
}

function splitLabel(label: string | null): { studentName: string; courseName: string } {
  const s = label ?? '';
  const i = s.indexOf(' — ');
  if (i < 0) return { studentName: s, courseName: '' };
  return { studentName: s.slice(0, i), courseName: s.slice(i + 3) };
}

/** 로그 행들 → 배치 목록(최근순). undo 이벤트는 해당 기록을 undone 처리. */
export function groupImportLogs(rows: ImportLogRow[]): ImportBatch[] {
  const undoneRecordIds = new Set<string>();
  for (const r of rows) {
    if (r.event_type === 'payment.import_undo' && r.entity_id) undoneRecordIds.add(r.entity_id);
  }

  const byBatch = new Map<string, ImportBatch>();
  for (const r of rows) {
    if (r.event_type !== 'payment.import_add' && r.event_type !== 'payment.import_refund') continue;
    const meta = (r.payload?.meta ?? {}) as Record<string, unknown>;
    const batchId = String(meta.batchId ?? '');
    if (!batchId) continue;
    const { studentName, courseName } = splitLabel(r.entity_label);
    const item: ImportHistoryItem = {
      recordId: r.entity_id ?? '',
      enrollmentId: String(meta.enrollmentId ?? ''),
      studentName,
      courseName,
      amount: Number(meta.amount ?? 0),
      paidAt: String(meta.paidAt ?? ''),
      kind: (meta.kind as SavedItem['kind']) ?? 'saved',
      ...(meta.createdEnrollmentId ? { createdEnrollmentId: String(meta.createdEnrollmentId) } : {}),
      undone: r.entity_id ? undoneRecordIds.has(r.entity_id) : false,
    };
    const existing = byBatch.get(batchId);
    if (existing) {
      existing.items.push(item);
      if (r.created_at > existing.createdAt) existing.createdAt = r.created_at;
    } else {
      byBatch.set(batchId, {
        batchId,
        source: String(meta.source ?? ''),
        createdAt: r.created_at,
        items: [item],
      });
    }
  }

  return Array.from(byBatch.values()).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}
