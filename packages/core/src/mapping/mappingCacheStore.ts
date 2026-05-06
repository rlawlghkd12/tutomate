import { supabase } from '../config/supabase';
import type { StandardField } from '../excel/types';

/**
 * 학원/조직별 매핑 캐시 조회. supabase 미설정 시 null.
 * key = (orgId, signature) — 동일 헤더 집합이면 캐시 HIT.
 */
export async function loadCachedMapping(
  orgId: string,
  signature: string,
): Promise<Record<string, StandardField> | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('mapping_profiles')
    .select('mapping')
    .eq('org_id', orgId)
    .eq('signature', signature)
    .maybeSingle();
  if (error || !data) return null;
  return data.mapping as Record<string, StandardField>;
}

/** 매핑 결과 캐시. supabase 미설정 시 no-op. */
export async function saveMappingCache(
  orgId: string,
  signature: string,
  mapping: Record<string, StandardField>,
): Promise<void> {
  if (!supabase) return;
  await supabase
    .from('mapping_profiles')
    .upsert(
      { org_id: orgId, signature, mapping },
      { onConflict: 'org_id,signature' },
    );
}
