import { z } from 'zod';
import { parseExcel } from '../../excel/ExcelParser';
import { normalizeRow } from '../../excel/DataNormalizer';
import { supabase } from '../../config/supabase';
import { computeEnrollmentSync } from '../persist/enrollmentSync';
import { resolveSelectionInserts } from '../import/resolveSelections';
import { buildPreview, type PreviewRowInput } from '../import/buildPreview';
import { buildPaymentLookup } from '../import/paymentLookup';
import type { SavedItem } from '../import/undoPlan';
import { parsePaymentMethod } from '../../types/index';
import type { ToolHandler, SmartCard, ToolContext } from '../types';
import type { StandardField } from '../../excel/types';

type PaymentSelection = {
  enrollmentId: string;
  paidAt: string;
  amount: number;
  paymentMethod?: 'cash' | 'card' | 'transfer';
  notes?: string;
};

/**
 * UI에서 사용자가 고른 결제 행만 저장 — 파일 재파싱·재매칭 없이 이미 해결된 enrollment로 직접 insert.
 * 정확 재업로드(같은 enrollment·날짜·금액)만 방어하고, 완납/초과는 사용자가 명시적으로 선택했으므로 존중한다.
 * 저장 후 enrollment 잔액·상태·최근납부일을 동기화한다.
 */
async function confirmPaymentSelections(
  selections: PaymentSelection[],
  ctx: ToolContext,
): Promise<{ status: 'done'; added: number; duplicated: number; errors: number; unmatched: number }> {
  if (!supabase) throw new Error('Supabase 미설정');
  const db = supabase;
  const enrollmentIds = Array.from(new Set(selections.map((s) => s.enrollmentId)));

  // 기존 결제 이력 (정확중복 방어 + 동기화 합산용)
  const existingByEnroll = new Map<string, { paidAt: string; amount: number }[]>();
  const { data: existingPays } = await db
    .from('payment_records')
    .select('enrollment_id, paid_at, amount')
    .in('enrollment_id', enrollmentIds);
  for (const p of existingPays ?? []) {
    const eid = (p as any).enrollment_id;
    const list = existingByEnroll.get(eid) ?? [];
    list.push({ paidAt: (p as any).paid_at, amount: Number((p as any).amount) });
    existingByEnroll.set(eid, list);
  }

  // enrollment 메타 (effectiveFee, 상태 보존, 표시용 이름)
  const { data: enrolls } = await db
    .from('enrollments')
    .select('id, discount_amount, payment_status, courses(name, fee), students(name)')
    .in('id', enrollmentIds);
  const effFeeBy = new Map<string, number>();
  const statusBy = new Map<string, string>();
  const nameBy = new Map<string, { studentName: string; courseName: string }>();
  for (const e of enrolls ?? []) {
    const fee = Number((e as any).courses?.fee ?? 0);
    const disc = Number((e as any).discount_amount ?? 0);
    effFeeBy.set((e as any).id, Math.max(0, fee - disc));
    statusBy.set((e as any).id, (e as any).payment_status);
    nameBy.set((e as any).id, {
      studentName: (e as any).students?.name ?? '',
      courseName: (e as any).courses?.name ?? '',
    });
  }

  // 방어: 클라이언트가 준 enrollmentId 중 현재 조직(RLS 스코프) 등록에 실재하는 것만 저장.
  // (enrolls 조회는 RLS로 현재 org 범위 → 반환된 id만 신뢰. 타 조직 id 주입 차단.)
  const validEnrollmentIds = new Set(statusBy.keys());
  const rejected = selections.filter((s) => !validEnrollmentIds.has(s.enrollmentId)).length;
  const safeSelections = selections.filter((s) => validEnrollmentIds.has(s.enrollmentId));

  // 순수 함수로 저장 대상 결정(정확중복 제외 + 배치 누적). 원본 existingByEnroll은 유지.
  const { inserts, duplicated } = resolveSelectionInserts(safeSelections, existingByEnroll);
  const rows = inserts.map((s) => ({
    organization_id: ctx.orgId,
    enrollment_id: s.enrollmentId,
    paid_at: s.paidAt,
    amount: s.amount,
    payment_method: s.paymentMethod ?? 'cash',
    ...(s.notes ? { notes: s.notes } : {}),
  }));

  let added = 0;
  const savedItems: SavedItem[] = [];
  if (rows.length > 0) {
    const { data, error } = await db.from('payment_records').insert(rows).select('id');
    if (error) throw new Error(error.message);
    added = data?.length ?? 0;
    // 저장된 각 건 — 되돌리기/내역 표시용 (insert 반환은 입력 순서 보존)
    (data ?? []).forEach((rec: any, i: number) => {
      const s = inserts[i];
      if (!s) return;
      const nm = nameBy.get(s.enrollmentId);
      savedItems.push({
        recordId: rec.id,
        enrollmentId: s.enrollmentId,
        studentName: nm?.studentName ?? '',
        courseName: nm?.courseName ?? '',
        amount: s.amount,
        paidAt: s.paidAt,
        kind: 'saved',
      });
    });
    // 동기화용 최종 이력 = 기존 + 저장분
    const finalByEnroll = new Map(existingByEnroll);
    for (const s of inserts) {
      finalByEnroll.set(s.enrollmentId, [
        ...(finalByEnroll.get(s.enrollmentId) ?? []),
        { paidAt: s.paidAt, amount: s.amount },
      ]);
    }
    const affected = Array.from(new Set(rows.map((r) => r.enrollment_id)));
    await Promise.all(
      affected.map((eid) => {
        const recs = finalByEnroll.get(eid) ?? [];
        const update = computeEnrollmentSync(recs, effFeeBy.get(eid) ?? 0, statusBy.get(eid));
        return db.from('enrollments').update(update).eq('id', eid);
      }),
    );
  }

  const card: SmartCard = {
    type: 'importResult',
    added,
    duplicated,
    errors: 0,
    ...(rejected > 0 ? { unmatched: rejected } : {}),
    ...(savedItems.length > 0 ? { savedItems } : {}),
  };
  ctx.emit?.(card);
  return { status: 'done', added, duplicated, errors: 0, unmatched: rejected };
}

const schema = z.object({
  fileId: z.string(),
  mapping: z.record(z.string(), z.string()),
  kind: z.enum(['students', 'payments']),
  /**
   * 결제 임포트에서 사용자가 미리보기 UI에서 고른 저장 대상 행(해결된 enrollment 포함).
   * 있으면 파일 재매칭 없이 이 목록만 저장한다(UI 선택 존중). 없으면 기존 자동 흐름(재매칭+dedup).
   */
  selections: z
    .array(
      z.object({
        enrollmentId: z.string(),
        paidAt: z.string(),
        amount: z.number(),
        paymentMethod: z.enum(['cash', 'card', 'transfer']).optional(),
        notes: z.string().optional(),
      }),
    )
    .optional(),
});

export const confirmImport: ToolHandler<typeof schema> = {
  name: 'confirmImport',
  description: '미리보기 확정. Supabase에 학생/결제 일괄 UPSERT. selections가 있으면 그 행만 저장.',
  schema,
  async execute({ fileId, mapping, kind, selections }, ctx) {
    if (!ctx.fileStash) throw new Error('FileStash 비활성');
    if (!supabase) throw new Error('Supabase 미설정');
    // students·payment_records는 organization_id가 NOT NULL이고 RLS(insert)가
    // organization_id = get_user_org_id() 를 요구한다. 이 값이 없으면 저장이 통째로 실패한다.
    if (!ctx.orgId) throw new Error('현재 조직을 확인할 수 없어 저장할 수 없습니다. 다시 로그인해 주세요.');

    // UI에서 고른 결제 행이 있으면: 재매칭 없이 그 행만 저장(정확중복만 방어) + enrollment 동기화.
    if (kind === 'payments' && selections && selections.length > 0) {
      return await confirmPaymentSelections(selections, ctx);
    }
    const buf = await ctx.fileStash.read(fileId);
    const parsed = parseExcel(new Uint8Array(buf));
    const typed = mapping as Record<string, StandardField>;

    const normalized = parsed.rows.map((r) => normalizeRow(r, typed));
    const valid = normalized.filter((n) => n.errors.length === 0);
    const errors = normalized.length - valid.length;

    let added = 0;
    let duplicated = 0;
    let unmatched = 0; // 학생·등록 매칭 실패(결제 임포트)
    const savedItems: SavedItem[] = [];

    if (kind === 'students') {
      const rows = valid
        .map((n) => ({
          name: n.data.name as string,
          phone: (n.data.phone as string | undefined) || null,
          birth_date: (n.data.birthDate as string | undefined) || null,
        }))
        .filter((r) => r.name);

      // students.phone엔 unique 제약이 없어 upsert(onConflict:'phone')가 불가능하다.
      // 조직 내 기존 전화번호를 조회해 새 학생만 insert하고, 이미 있는 번호는 중복으로 건너뛴다.
      // (select는 RLS로 현재 조직 범위로 자동 스코프됨)
      const phones = rows.map((r) => r.phone).filter(Boolean) as string[];
      const existing = new Set<string>();
      if (phones.length > 0) {
        const { data: dup, error: dupErr } = await supabase
          .from('students')
          .select('phone')
          .in('phone', phones);
        if (dupErr) throw new Error(dupErr.message);
        for (const d of dup ?? []) {
          const p = (d as { phone?: string }).phone;
          if (p) existing.add(p);
        }
      }
      // 기존(DB) 전화 + 파일 내 중복 전화를 모두 제외 (같은 파일에 같은 전화가 두 번 있어도 1명만 생성).
      const seenPhone = new Set<string>();
      const toInsert = rows
        .filter((r) => {
          if (r.phone && existing.has(r.phone)) return false; // DB에 이미 있음
          if (r.phone) {
            if (seenPhone.has(r.phone)) return false; // 파일 내 중복
            seenPhone.add(r.phone);
          }
          return true;
        })
        .map((r) => ({ ...r, organization_id: ctx.orgId }));
      duplicated = rows.length - toInsert.length;

      if (toInsert.length > 0) {
        const { data, error } = await supabase
          .from('students')
          .insert(toInsert)
          .select('id');
        if (error) throw new Error(error.message);
        added = data?.length ?? 0;
      }
    } else {
      // payments — previewImport과 동일한 lookup·matching(buildPreview)으로 통일해
      //   미리보기 화면과 확정 결과를 일치시킨다. LLM(router)은 붙이지 않아 자동저장을 안전하게 막고,
      //   결정론 auto 행만 저장(애매행은 needsConfirm으로 미저장). 이름 폴백·메모→분기·비결제 필터 포함.
      const rowsInput: PreviewRowInput[] = valid
        .map((n, i) => ({
          rowIndex: i,
          name: String((n.data.name as string | undefined) ?? ''),
          phone: (n.data.phone as string | undefined) || undefined,
          amount: Number(n.data.amount),
          paidAt: String((n.data.paymentDate as string | undefined) ?? ''),
          paymentMethod: parsePaymentMethod(n.data.paymentMethod),
          className: (n.data.className as string | undefined) || undefined,
          memo: (n.data.note as string | undefined) || undefined,
        }))
        .filter((r) => (r.phone || r.name) && Number.isFinite(r.amount) && r.paidAt);
      unmatched += valid.length - rowsInput.length; // 이름·전화·금액·날짜가 없어 매칭 불가한 행

      const lookup = await buildPaymentLookup(rowsInput);
      if (!lookup) {
        unmatched += rowsInput.length; // 매칭되는 학생이 없음
      } else {
        // 동기화 시 withdrawn/exempt 상태 보존을 위한 상태 조회
        const eids = lookup.enrollments.map((e) => e.id);
        const statusByEnroll = new Map<string, string>();
        if (eids.length > 0) {
          const { data: statusRows } = await supabase
            .from('enrollments')
            .select('id, payment_status')
            .in('id', eids);
          for (const e of statusRows ?? []) statusByEnroll.set((e as any).id, (e as any).payment_status);
        }

        const preview = buildPreview(rowsInput, lookup); // 결정론(자동저장 안전)
        const rows: any[] = [];
        const savedMeta: { enrollmentId: string; studentName: string; courseName: string; amount: number; paidAt: string }[] = [];
        for (const r of preview) {
          if (r.decision === 'include' && r.enrollmentId) {
            rows.push({
              organization_id: ctx.orgId,
              enrollment_id: r.enrollmentId,
              paid_at: r.paidAt,
              amount: r.amount,
              payment_method: (r.paymentMethod as 'cash' | 'card' | 'transfer' | undefined) ?? 'cash',
              ...(r.memo ? { notes: r.memo } : {}),
            });
            savedMeta.push({
              enrollmentId: r.enrollmentId,
              studentName: r.studentName ?? r.payerName,
              courseName: r.courseName ?? '',
              amount: r.amount,
              paidAt: r.paidAt,
            });
          } else if (r.dedup !== 'none') {
            duplicated++; // 정확중복/완납/초과
          } else {
            unmatched++; // 미매칭 또는 애매(needsConfirm) — 자동 저장 안 함
          }
        }

        if (rows.length > 0) {
          const { data, error } = await supabase.from('payment_records').insert(rows).select('id');
          if (error) throw new Error(error.message);
          added = data?.length ?? 0;

          // 저장된 각 건 — 되돌리기/내역 표시용 (insert 반환은 입력 순서 보존)
          (data ?? []).forEach((rec: any, i: number) => {
            const m = savedMeta[i];
            if (!m) return;
            savedItems.push({
              recordId: rec.id,
              enrollmentId: m.enrollmentId,
              studentName: m.studentName,
              courseName: m.courseName,
              amount: m.amount,
              paidAt: m.paidAt,
              kind: 'saved',
            });
          });

          // enrollment 동기화 (FR-6). buildPreview가 lookup.existingByEnrollment에 저장분을 누적해둠.
          const affected = Array.from(new Set(rows.map((r) => r.enrollment_id)));
          await Promise.all(
            affected.map((eid) => {
              const recs = lookup.existingByEnrollment.get(eid) ?? [];
              const effFee = lookup.effectiveFeeByEnrollment.get(eid) ?? 0;
              const update = computeEnrollmentSync(recs, effFee, statusByEnroll.get(eid));
              return supabase!.from('enrollments').update(update).eq('id', eid);
            }),
          );
        }
      }
    }

    const card: SmartCard = {
      type: 'importResult',
      added,
      duplicated,
      errors,
      ...(unmatched > 0 ? { unmatched } : {}),
      ...(savedItems.length > 0 ? { savedItems } : {}),
    };
    ctx.emit?.(card);
    return { status: 'done', added, duplicated, errors, unmatched };
  },
};
