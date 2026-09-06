import { z } from 'zod';
import { supabase } from '../../config/supabase';
import { computeEnrollmentSync } from '../persist/enrollmentSync';
import { planUndo, toUndoTargets, type UndoState, type SavedItem } from '../import/undoPlan';
import type { ToolHandler, SmartCard } from '../types';

/**
 * AI 임포트로 저장한 결제 건 되돌리기 — payment_records 삭제 + enrollment 잔액 재동기화.
 * LLM이 아니라 UI(결과 카드 [되돌리기])에서 ai:dispatch로만 호출된다(자동 호출 금지).
 *
 * 안전: 실행 시점 현재 상태로 planUndo를 다시 검사한다(§PLAN 3.6). 클라이언트 판정을 신뢰하지 않음.
 *   - 이미 삭제됨 → skip · 환불 걸린 등록 → blocked · 그 외 → delete
 *   - 신규 등록으로 만들어졌고 남은 기록이 0이면 그 등록도 삭제
 * RLS로 현재 조직 기록만 조회/삭제되므로 타 조직 주입은 자연 차단된다.
 */
const schema = z.object({
  items: z.array(
    z.object({
      recordId: z.string(),
      enrollmentId: z.string(),
      studentName: z.string().optional(),
      courseName: z.string().optional(),
      amount: z.number(),
      paidAt: z.string(),
      kind: z.enum(['saved', 'enrolled', 'refunded']).optional(),
      createdEnrollmentId: z.string().optional(),
    }),
  ),
});

export const undoImport: ToolHandler<typeof schema> = {
  name: 'undoImport',
  description:
    'AI 임포트로 저장한 결제 건을 되돌린다(삭제 + 잔액 재동기화). UI 되돌리기 버튼에서만 호출.',
  schema,
  async execute({ items }, ctx) {
    if (!supabase) throw new Error('Supabase 미설정');
    if (!ctx.orgId) throw new Error('현재 조직을 확인할 수 없습니다. 다시 로그인해 주세요.');
    const db = supabase;
    if (items.length === 0) {
      const empty: SmartCard = { type: 'importUndoResult', undone: 0, skipped: 0, blocked: 0, failed: 0 };
      ctx.emit?.(empty);
      return { status: 'done', undone: 0, skipped: 0, blocked: 0, failed: 0 };
    }

    const recordIds = items.map((i) => i.recordId);
    const enrollmentIds = Array.from(new Set(items.map((i) => i.enrollmentId)));

    // 대상 기록의 현재 상태 (RLS로 현재 조직만 반환 → org 가드 내장)
    const { data: targetRecs } = await db
      .from('payment_records')
      .select('id, amount, paid_at')
      .in('id', recordIds);
    const recordById = new Map<string, { exists: boolean; amount: number; paidAt: string }>();
    for (const r of targetRecs ?? []) {
      recordById.set((r as any).id, {
        exists: true,
        amount: Number((r as any).amount),
        paidAt: (r as any).paid_at,
      });
    }

    // 등록별 현재 전체 기록 (개수·환불여부 판정 + 삭제 후 재동기화용)
    const { data: enrollRecs } = await db
      .from('payment_records')
      .select('id, enrollment_id, amount, paid_at')
      .in('enrollment_id', enrollmentIds);
    const recsByEnroll = new Map<string, { id: string; amount: number; paidAt: string }[]>();
    for (const r of enrollRecs ?? []) {
      const eid = (r as any).enrollment_id;
      const arr = recsByEnroll.get(eid) ?? [];
      arr.push({ id: (r as any).id, amount: Number((r as any).amount), paidAt: (r as any).paid_at });
      recsByEnroll.set(eid, arr);
    }
    const recordCountByEnrollment = new Map<string, number>();
    const hasRefundByEnrollment = new Map<string, boolean>();
    for (const [eid, arr] of recsByEnroll) {
      recordCountByEnrollment.set(eid, arr.length);
      hasRefundByEnrollment.set(eid, arr.some((x) => x.amount < 0));
    }

    // enrollment 메타 (재동기화용 effectiveFee·상태)
    const { data: enrolls } = await db
      .from('enrollments')
      .select('id, discount_amount, payment_status, courses(fee)')
      .in('id', enrollmentIds);
    const effFeeBy = new Map<string, number>();
    const statusBy = new Map<string, string>();
    const validEnroll = new Set<string>();
    for (const e of enrolls ?? []) {
      const fee = Number((e as any).courses?.fee ?? 0);
      const disc = Number((e as any).discount_amount ?? 0);
      effFeeBy.set((e as any).id, Math.max(0, fee - disc));
      statusBy.set((e as any).id, (e as any).payment_status);
      validEnroll.add((e as any).id);
    }

    // 현재 상태로 되돌리기 판정 재검사 (클라이언트 우회 방지)
    const state: UndoState = { recordById, recordCountByEnrollment, hasRefundByEnrollment };
    const verdicts = planUndo(toUndoTargets(items as SavedItem[]), state);
    const enrollByRecord = new Map(items.map((i) => [i.recordId, i.enrollmentId]));

    const toDelete: string[] = [];
    const enrollmentsToDelete = new Set<string>();
    let skipped = 0;
    let blocked = 0;
    for (const v of verdicts) {
      if (v.action === 'skip') { skipped++; continue; }
      if (v.action === 'blocked') { blocked++; continue; }
      toDelete.push(v.recordId);
      if (v.action === 'deleteWithEnrollment' && v.enrollmentId && validEnroll.has(v.enrollmentId)) {
        enrollmentsToDelete.add(v.enrollmentId);
      }
    }

    let undone = 0;
    let failed = 0;
    if (toDelete.length > 0) {
      const { error } = await db.from('payment_records').delete().in('id', toDelete);
      if (error) {
        failed += toDelete.length;
      } else {
        undone = toDelete.length;
        const deleted = new Set(toDelete);

        // 영향 등록 재동기화 (삭제 후 남은 기록 기준). 곧 삭제될 신규 등록은 제외.
        const affected = Array.from(
          new Set(toDelete.map((rid) => enrollByRecord.get(rid)).filter(Boolean) as string[]),
        );
        await Promise.all(
          affected.map((eid) => {
            if (enrollmentsToDelete.has(eid)) return Promise.resolve(undefined);
            const remaining = (recsByEnroll.get(eid) ?? [])
              .filter((r) => !deleted.has(r.id))
              .map((r) => ({ paidAt: r.paidAt, amount: r.amount }));
            const update = computeEnrollmentSync(remaining, effFeeBy.get(eid) ?? 0, statusBy.get(eid));
            return db.from('enrollments').update(update).eq('id', eid);
          }),
        );

        // 신규 등록 정리: 삭제 후 남은 기록이 0인 등록만 제거
        for (const eid of enrollmentsToDelete) {
          const remaining = (recsByEnroll.get(eid) ?? []).filter((r) => !deleted.has(r.id));
          if (remaining.length === 0) await db.from('enrollments').delete().eq('id', eid);
        }
      }
    }

    const card: SmartCard = { type: 'importUndoResult', undone, skipped, blocked, failed };
    ctx.emit?.(card);
    return { status: 'done', undone, skipped, blocked, failed };
  },
};
