/**
 * 미리보기 파이프라인 (주입식, 순수·결정론) — 결제 행 → ImportPreviewRow[].
 *
 * 흐름: prefilter(전화·이름·강좌명·메모→분기 매칭) → DedupChecker(정확/완납/초과).
 * 애매(다후보) 행은 needsConfirm으로 남겨 UI 후보 드롭다운에서 사용자가 확정한다(자동추정 금지 = 안전).
 * DB/네트워크는 주입 데이터(lookup)로 대체 → 단위테스트로 전 로직 검증 가능.
 * (LLM 미사용: 파싱·중복·매칭이 결정론으로 충분. 근거: DEV 아키텍처 정정 2026-09-03)
 */
import { prefilter, type PrefilterInput, type PrefilterCandidate } from '../matching/prefilter';
import { checkDuplicate, type DedupPayment } from '../dedup/DedupChecker';
import { isNonPaymentRowName } from './rowFilter';
import type { ImportPreviewRow, PreviewMatchStatus } from './ImportPreviewModel';

export interface PreviewRowInput {
  rowIndex: number;
  name: string;
  phone?: string;
  amount: number;
  paidAt: string;
  memo?: string;
  paymentMethod?: string;
  className?: string;
}

export interface PreviewLookup extends PrefilterInput {
  /** enrollment_id → (수강료 - 할인). 완납/초과 판정 기준 */
  effectiveFeeByEnrollment: Map<string, number>;
  /** enrollment_id → 기존 결제 이력 */
  existingByEnrollment: Map<string, DedupPayment[]>;
}

/** 결정된 enrollment로 중복 판정 후 행을 마감(중복 시 decision/included 조정). */
function applyDedup(
  row: ImportPreviewRow,
  chosen: PrefilterCandidate,
  lookup: PreviewLookup,
): void {
  row.enrollmentId = chosen.enrollmentId;
  row.studentName = chosen.studentName;
  row.courseName = chosen.courseName;
  row.quarter = chosen.quarter;

  const existing = lookup.existingByEnrollment.get(chosen.enrollmentId) ?? [];
  const effFee = lookup.effectiveFeeByEnrollment.get(chosen.enrollmentId) ?? 0;
  const incoming: DedupPayment = { paidAt: row.paidAt, amount: row.amount };

  let level: ImportPreviewRow['dedup'] = 'none';
  let action: 'exclude' | 'confirm' | 'include' = 'include';
  if (effFee > 0) {
    const r = checkDuplicate({ effectiveFee: effFee, existing, incoming });
    level = r.level;
    action = r.action;
    if (action !== 'include' && r.reason) row.reason = r.reason;
  } else {
    const exact = existing.some((e) => e.paidAt === incoming.paidAt && e.amount === incoming.amount);
    if (exact) {
      level = 'exact';
      action = 'exclude';
      row.reason = '이미 저장된 결제예요 (같은 파일을 또 올리신 것 같아요)';
    }
  }
  row.dedup = level;

  if (action === 'exclude') {
    row.decision = 'excluded';
    row.included = false;
  } else if (action === 'confirm') {
    // matchStatus가 auto였어도 중복 의심이면 확인 필요로 낮춘다
    row.matchStatus = 'needsConfirm';
    row.decision = 'needsConfirm';
    row.included = false;
  } else {
    row.decision = 'include';
    row.included = true;
    // 배치 내 누적 — 같은 파일의 후속 행이 이 결제를 반영해 판정되도록
    lookup.existingByEnrollment.set(chosen.enrollmentId, [...existing, incoming]);
  }
}

export function buildPreview(rows: PreviewRowInput[], lookup: PreviewLookup): ImportPreviewRow[] {
  const out: ImportPreviewRow[] = [];
  for (const row of rows) {
    // 합계·소계 등 비결제 행은 명확한 사유로 제외.
    const pf = isNonPaymentRowName(row.name)
      ? { status: 'unmatched' as const, candidates: [], reason: '합계·소계 줄이라 결제가 아니에요 (비결제 행)', tags: ['비결제'] }
      : prefilter(row, lookup);

    const base: ImportPreviewRow = {
      rowIndex: row.rowIndex,
      payerName: row.name,
      amount: row.amount,
      paidAt: row.paidAt,
      memo: row.memo,
      paymentMethod: row.paymentMethod,
      matchStatus: 'unmatched' as PreviewMatchStatus,
      candidates: pf.candidates,
      dedup: 'none',
      decision: 'excluded',
      reason: pf.reason,
      tags: pf.tags ?? [],
      included: false,
    };

    if (pf.status === 'auto') {
      base.matchStatus = 'auto';
      applyDedup(base, pf.candidates[0], lookup);
    } else if (pf.status === 'ambiguous') {
      // 다후보 → 자동추정 금지. UI 후보 드롭다운에서 사용자가 확정.
      base.matchStatus = 'needsConfirm';
      base.decision = 'needsConfirm';
    } else {
      base.matchStatus = 'unmatched';
      base.decision = 'excluded';
    }
    out.push(base);
  }
  return out;
}
