import { describe, it, expect, vi } from 'vitest';
import * as XLSX from 'xlsx';
import { parseExcelHeaders } from '../../tools/parseExcelHeaders';
import { mapColumns } from '../../tools/mapColumns';

vi.mock('../../../mapping/mappingCacheStore', () => ({
  loadCachedMapping: vi.fn().mockResolvedValue(null),
  saveMappingCache: vi.fn().mockResolvedValue(undefined),
}));

function buildBuffer(): Buffer {
  const ws = XLSX.utils.aoa_to_sheet([
    ['이름', '연락처', '결제일', '금액'],
    ['홍길동', '01012345678', '2025-04-05', '120000'],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 's');
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}

const baseCtx = () => ({
  orgId: 'o1',
  userId: 'u1',
  fileStash: { read: async () => buildBuffer() },
  emit: vi.fn(),
});

describe('parseExcelHeaders', () => {
  it('헤더 + 샘플 + totalRows 반환', async () => {
    const ctx = baseCtx();
    const r = (await parseExcelHeaders.execute({ fileId: 'x' }, ctx)) as any;
    expect(r.headers).toEqual(['이름', '연락처', '결제일', '금액']);
    expect(r.sample).toHaveLength(1);
    expect(r.totalRows).toBe(1);
  });
});

describe('mapColumns', () => {
  it('전부 매칭 → status=ok, cacheHit=false (캐시 MISS)', async () => {
    const ctx = baseCtx();
    const r = (await mapColumns.execute(
      { headers: ['이름', '연락처', '결제일', '금액'] },
      ctx,
    )) as any;
    expect(r.status).toBe('ok');
    expect(r.cacheHit).toBe(false);
  });

  it('일부 미매칭 → status=mismatch + emit mappingError 카드', async () => {
    const ctx = baseCtx();
    const r = (await mapColumns.execute(
      { headers: ['이름', '도시락여부'] },
      ctx,
    )) as any;
    expect(r.status).toBe('mismatch');
    expect(r.unmatched).toEqual(['도시락여부']);
    expect(ctx.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'mappingError', unmatched: ['도시락여부'] }),
    );
  });
});
