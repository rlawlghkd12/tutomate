import type { StandardField } from '../excel/types';
import { findField, normalizeHeader } from './synonyms';

export interface MappingResult {
  status: 'ok' | 'mismatch';
  mapping: Record<string, StandardField>;
  unmatched: string[];
}

/**
 * 헤더 시퀀스의 안정적인 시그니처 — 정렬 후 djb2 해시.
 * 같은 헤더 집합이면 순서가 달라도 동일 시그니처 → 캐시 히트율 향상.
 */
export function computeSignature(headers: string[]): string {
  const norm = headers.map(normalizeHeader).filter(Boolean).sort().join('|');
  // djb2: 환경 무관 결정론적 해시
  let h = 5381;
  for (let i = 0; i < norm.length; i++) {
    h = ((h << 5) + h + norm.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * 룰 기반 매칭 시도. 미매칭 컬럼이 1개라도 있으면 status='mismatch'.
 */
export function tryRuleMapping(headers: string[]): MappingResult {
  const mapping: Record<string, StandardField> = {};
  const unmatched: string[] = [];
  for (const h of headers) {
    const f = findField(normalizeHeader(h));
    if (f) mapping[h] = f;
    else unmatched.push(h);
  }
  return {
    status: unmatched.length === 0 ? 'ok' : 'mismatch',
    mapping,
    unmatched,
  };
}
