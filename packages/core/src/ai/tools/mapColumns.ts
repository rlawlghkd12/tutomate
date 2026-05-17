import { z } from 'zod';
import {
  tryRuleMapping,
  computeSignature,
} from '../../mapping/ColumnMapper';
import {
  loadCachedMapping,
  saveMappingCache,
} from '../../mapping/mappingCacheStore';
import type { ToolHandler, SmartCard } from '../types';

const schema = z.object({
  headers: z.array(z.string()),
});

export const mapColumns: ToolHandler<typeof schema> = {
  name: 'mapColumns',
  description:
    '엑셀 헤더를 표준 필드로 매핑합니다. 캐시 우선, 룰 사전 폴백, 미매칭 컬럼 시 거부.',
  schema,
  async execute({ headers }, ctx) {
    const sig = computeSignature(headers);
    const cached = await loadCachedMapping(ctx.orgId, sig);
    if (cached) {
      return { status: 'ok', mapping: cached, cacheHit: true };
    }
    const r = tryRuleMapping(headers);
    if (r.status === 'mismatch') {
      const card: SmartCard = {
        type: 'mappingError',
        matched: Object.keys(r.mapping),
        unmatched: r.unmatched,
      };
      ctx.emit?.(card);
      return {
        status: 'mismatch',
        matched: Object.keys(r.mapping),
        unmatched: r.unmatched,
      };
    }
    await saveMappingCache(ctx.orgId, sig, r.mapping);
    return { status: 'ok', mapping: r.mapping, cacheHit: false };
  },
};
