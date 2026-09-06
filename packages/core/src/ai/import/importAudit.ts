/**
 * AI 임포트 감사 로그 엔트리 빌더 — 순수 함수. 참고: docs/PLAN-ai-import-history-undo.md (P1).
 *
 * AI 임포트 도구는 Electron 메인에서 실행돼 renderer의 logEvent(authStore 의존)를 못 쓴다.
 * 그래서 ctx(orgId/userId)로 event_logs INSERT 행을 직접 만든다(실제 insert는 도구가 수행).
 * 한 번의 임포트는 batchId로 묶여 '처리 내역' 화면에서 배치 단위 조회·되돌리기가 가능하다.
 */
import type { SavedItem } from './undoPlan';

export interface AuditRow {
  organization_id: string;
  actor_user_id: string | null;
  actor_label: string;
  event_type: string;
  entity_type: string;
  entity_id: string | null;
  entity_label: string | null;
  payload: Record<string, unknown>;
}

export interface ImportAuditMeta {
  orgId: string;
  userId?: string;
  /** 한 번의 임포트를 묶는 id */
  batchId: string;
  /** 'excel' | 'bank' — 어떤 임포트인지 */
  source: 'excel' | 'bank';
}

/** 저장된 각 건 → event_logs INSERT 행 (payment.import_add / import_refund). */
export function buildImportLogEntries(items: SavedItem[], meta: ImportAuditMeta): AuditRow[] {
  return items.map((it) => ({
    organization_id: meta.orgId,
    actor_user_id: meta.userId || null,
    actor_label: 'AI 임포트',
    event_type: it.kind === 'refunded' ? 'payment.import_refund' : 'payment.import_add',
    entity_type: 'payment_record',
    entity_id: it.recordId,
    entity_label: [it.studentName, it.courseName].filter(Boolean).join(' — ') || null,
    payload: {
      meta: {
        batchId: meta.batchId,
        source: meta.source,
        amount: it.amount,
        paidAt: it.paidAt,
        kind: it.kind,
        enrollmentId: it.enrollmentId,
        ...(it.createdEnrollmentId ? { createdEnrollmentId: it.createdEnrollmentId } : {}),
      },
    },
  }));
}

/** 되돌린 각 건 → event_logs INSERT 행 (payment.import_undo). */
export function buildUndoLogEntries(items: SavedItem[], meta: ImportAuditMeta): AuditRow[] {
  return items.map((it) => ({
    organization_id: meta.orgId,
    actor_user_id: meta.userId || null,
    actor_label: 'AI 임포트 되돌리기',
    event_type: 'payment.import_undo',
    entity_type: 'payment_record',
    entity_id: it.recordId,
    entity_label: [it.studentName, it.courseName].filter(Boolean).join(' — ') || null,
    payload: {
      meta: {
        batchId: meta.batchId,
        source: meta.source,
        amount: it.amount,
        paidAt: it.paidAt,
        enrollmentId: it.enrollmentId,
      },
    },
  }));
}
