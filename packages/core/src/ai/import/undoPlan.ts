/**
 * AI 임포트 되돌리기 '계획' — 순수 함수 (정합성 판정). 참고: docs/PLAN-ai-import-history-undo.md §3.6.
 *
 * 되돌리기는 "임포트 당시 로그"를 맹신하지 않고 '실행 시점 현재 상태'로 다시 판정한다.
 * 이 함수는 각 건을 delete / deleteWithEnrollment / skip / blocked 로 분류하고,
 * 사용자 확인이 필요한 경우(requiresConfirm) 사유를 붙인다. 실제 삭제·재동기화는 tool이 수행한다.
 */

/** 임포트가 실제로 저장한 한 건 (confirmImport/confirmBankDeposits 결과). */
export interface SavedItem {
  recordId: string;
  enrollmentId: string;
  studentName: string;
  courseName: string;
  amount: number;
  paidAt: string;
  kind: 'saved' | 'enrolled' | 'refunded';
  /** 이 건이 신규 수강 등록을 만들었으면 그 등록 id (되돌릴 때 등록 삭제 후보) */
  createdEnrollmentId?: string;
}

/** 되돌리기 대상 (SavedItem에서 판정에 필요한 부분만). */
export interface UndoTarget {
  recordId: string;
  enrollmentId: string;
  /** 임포트 시점 스냅샷 — 이후 수정 여부 비교용 */
  importedAmount: number;
  importedPaidAt: string;
  /** 이 건이 신규 등록을 만들었으면 그 등록 id */
  createdEnrollmentId?: string;
}

/** recordId의 현재 DB 상태. */
export interface CurrentRecordState {
  exists: boolean;
  amount: number;
  paidAt: string;
}

/** 되돌리기 판정에 필요한 현재 상태 스냅샷. */
export interface UndoState {
  /** recordId → 현재 상태 (없으면 이미 삭제됨) */
  recordById: Map<string, CurrentRecordState>;
  /** enrollmentId → 그 등록의 현재 payment_records 개수 */
  recordCountByEnrollment: Map<string, number>;
  /** enrollmentId → 그 등록에 환불(음수) 기록이 있는가 */
  hasRefundByEnrollment: Map<string, boolean>;
}

export type UndoAction = 'delete' | 'deleteWithEnrollment' | 'skip' | 'blocked';

export interface UndoVerdict {
  recordId: string;
  action: UndoAction;
  /** deleteWithEnrollment일 때 함께 삭제할 등록 id */
  enrollmentId?: string;
  /** true면 삭제 전 사용자 확인 필요(수정됨/등록 동반 삭제) */
  requiresConfirm?: boolean;
  /** skip/blocked/확인 사유 (사용자 노출용) */
  reason?: string;
}

/**
 * 각 대상을 판정한다. 순서(우선순위):
 *   1) 기록이 이미 없음        → skip (무동작)
 *   2) 등록에 환불 기록 있음    → blocked (합계 음수/정합성 위험, 먼저 환불 정리)
 *   3) 신규 등록 + 유일 기록    → deleteWithEnrollment (확인 필요)
 *      그 외                    → delete
 *   +) 임포트 후 금액/날짜 수정 → requiresConfirm 부여 (확인 후 진행)
 */
export function planUndo(targets: UndoTarget[], state: UndoState): UndoVerdict[] {
  return targets.map((t): UndoVerdict => {
    const cur = state.recordById.get(t.recordId);
    if (!cur || !cur.exists) {
      return { recordId: t.recordId, action: 'skip', reason: '이미 취소된 기록입니다.' };
    }

    if (state.hasRefundByEnrollment.get(t.enrollmentId)) {
      return {
        recordId: t.recordId,
        action: 'blocked',
        reason: '환불 기록이 있는 수강이라 되돌릴 수 없습니다. 먼저 환불을 정리해주세요.',
      };
    }

    const modified = cur.amount !== t.importedAmount || cur.paidAt !== t.importedPaidAt;
    const reasons: string[] = [];
    if (modified) reasons.push('임포트 후 수정된 기록입니다. 삭제하면 수정분도 사라집니다.');

    // 신규 등록으로 만들어졌고, 지금도 그 등록의 유일한 기록이면 등록까지 삭제 후보
    const isSoleRecord = (state.recordCountByEnrollment.get(t.enrollmentId) ?? 0) <= 1;
    if (t.createdEnrollmentId && isSoleRecord) {
      reasons.push('새로 만든 수강 등록도 함께 삭제됩니다.');
      return {
        recordId: t.recordId,
        action: 'deleteWithEnrollment',
        enrollmentId: t.createdEnrollmentId,
        requiresConfirm: true,
        reason: reasons.join(' '),
      };
    }

    return {
      recordId: t.recordId,
      action: 'delete',
      ...(modified ? { requiresConfirm: true, reason: reasons.join(' ') } : {}),
    };
  });
}

/** SavedItem[] → UndoTarget[] 변환 (임포트 스냅샷을 그대로 사용). */
export function toUndoTargets(items: SavedItem[]): UndoTarget[] {
  return items.map((it) => ({
    recordId: it.recordId,
    enrollmentId: it.enrollmentId,
    importedAmount: it.amount,
    importedPaidAt: it.paidAt,
    ...(it.createdEnrollmentId ? { createdEnrollmentId: it.createdEnrollmentId } : {}),
  }));
}
