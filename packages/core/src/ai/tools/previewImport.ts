import { z } from 'zod';
import { parseExcel } from '../../excel/ExcelParser';
import { normalizeRow } from '../../excel/DataNormalizer';
import { supabase } from '../../config/supabase';
import { buildPreview, type PreviewRowInput } from '../import/buildPreview';
import { buildPaymentLookup } from '../import/paymentLookup';
import type { ImportPreviewRow } from '../import/ImportPreviewModel';
import { parsePaymentMethod } from '../../types/index';
import type { ToolHandler, SmartCard } from '../types';
import type { StandardField } from '../../excel/types';

const schema = z.object({
  fileId: z.string(),
  mapping: z.record(z.string(), z.string()),
  kind: z.enum(['students', 'payments']),
});

/**
 * 결제 임포트 강화 미리보기 — 정규화 행을 매칭·중복 판정까지 돌려 ImportPreviewRow[]를 만든다.
 * Supabase 조회로 학생·등록·기존결제를 모아 buildPreview(결정론)로 실행. 조회 실패 시 undefined 반환(기존 동작 유지).
 * 결정론 매칭 — 애매(다후보) 행은 needsConfirm으로 남겨 UI 후보 드롭다운에서 사용자가 확정한다.
 */
async function tryBuildPaymentPreview(
  normalized: ReturnType<typeof normalizeRow>[],
): Promise<ImportPreviewRow[] | undefined> {
  if (!supabase) return undefined;
  try {
    const rows: PreviewRowInput[] = normalized
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
    if (rows.length === 0) return undefined;

    // 학생·강좌·등록·기존결제 lookup (이름 폴백 포함) — confirmImport 비선택 경로와 공유.
    const lookup = await buildPaymentLookup(rows);
    if (!lookup) return undefined;
    return buildPreview(rows, lookup);
  } catch (e) {
    // 조회·판정 실패해도 미리보기 자체는 계속(기존 rows만 표시). 원인 파악을 위해 로그는 남긴다.
    console.warn('[previewImport] 강화 미리보기 생성 실패 — 기본 미리보기로 폴백:', e);
    return undefined;
  }
}

export const previewImport: ToolHandler<typeof schema> = {
  name: 'previewImport',
  description:
    '매핑을 적용한 정규화 결과 미리보기 (최대 50행 + 통계). UI에 importPreview 카드를 띄웁니다.',
  schema,
  async execute({ fileId, mapping, kind }, ctx) {
    if (!ctx.fileStash) throw new Error('FileStash 비활성');
    const buf = await ctx.fileStash.read(fileId);
    const parsed = parseExcel(new Uint8Array(buf));
    const typed = mapping as Record<string, StandardField>;

    // 전체 행 정규화(오류 통계·강화 미리보기용). 레거시 표시는 앞 50행만.
    const allNormalized = parsed.rows.map((r) => normalizeRow(r, typed));
    const previewRowsRaw = allNormalized.slice(0, 50);
    const errorRows = allNormalized.filter((p) => p.errors.length > 0).length;

    // 결제 임포트면 전체 유효행에 대해 매칭·중복 판정까지 반영한 강화 미리보기(선택) 추가.
    // (50행 슬라이스가 아니라 전체 → 대용량 파일도 행별 선택 가능)
    const previewRows =
      kind === 'payments'
        ? await tryBuildPaymentPreview(allNormalized.filter((p) => p.errors.length === 0))
        : undefined;

    const card: SmartCard = {
      type: 'importPreview',
      fileId,
      mapping,
      kind,
      rows: previewRowsRaw.map((p) => ({
        data: p.data,
        errors: p.errors.map((e) => e.field),
      })),
      total: parsed.rows.length,
      errorRows,
      ...(previewRows ? { previewRows } : {}),
    };
    ctx.emit?.(card);
    return { status: 'preview', total: parsed.rows.length, errorRows };
  },
};
