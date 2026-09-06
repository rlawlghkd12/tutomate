import type { StandardField } from '../excel/types';
import { findField, normalizeHeader, isIgnorableHeader } from './synonyms';

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
  // 무시 컬럼(순번·출석 등)은 시그니처에서 제외 → 여분 컬럼만 다른 파일이 캐시를 공유(히트율↑).
  const norm = headers
    .map(normalizeHeader)
    .filter((h) => h && !isIgnorableHeader(h))
    .sort()
    .join('|');
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
  // 같은 표준 필드에 두 열이 매핑되면(예: '수강료' + '결제금액' → 둘 다 amount) 어느 열이 맞는지
  // 자동으로 정할 수 없다(열 순서에 따라 last-write-wins로 금액이 조용히 바뀌는 위험). → 충돌로 보고
  // 두 열 모두 미매칭 처리해 사용자에게 확인시킨다.
  const fieldToHeader = new Map<StandardField, string>();
  const conflicted = new Set<StandardField>();
  for (const h of headers) {
    const nh = normalizeHeader(h);
    // 무시 컬럼을 먼저 판정한다. (findField의 부분일치가 'no'를 note의 부분문자열로 오인해
    //  무시 컬럼이 엉뚱한 필드로 매핑되는 것을 방지)
    if (isIgnorableHeader(nh)) continue;
    const f = findField(nh);
    if (!f) {
      unmatched.push(h);
      continue;
    }
    if (conflicted.has(f)) {
      unmatched.push(h);
      continue;
    }
    const prev = fieldToHeader.get(f);
    if (prev !== undefined) {
      // 첫 매핑도 취소하고 두 열을 모두 사용자 확인 대상으로 돌린다.
      conflicted.add(f);
      delete mapping[prev];
      unmatched.push(prev, h);
      continue;
    }
    fieldToHeader.set(f, h);
    mapping[h] = f;
  }
  return {
    status: unmatched.length === 0 ? 'ok' : 'mismatch',
    mapping,
    unmatched,
  };
}
