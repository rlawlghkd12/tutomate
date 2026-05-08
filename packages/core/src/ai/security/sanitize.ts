/**
 * 사용자 데이터 sanitize — LLM에 노출되는 셀 값/문자열 입력의 prompt injection 방어.
 *
 * 전략:
 * - 제어 문자 제거
 * - 길이 제한 (긴 셀이 토큰 폭주 + injection 페이로드 방지)
 * - 명령어처럼 보이는 패턴 감지 시 marker 추가
 */

const MAX_CELL_LEN = 200;

const INJECTION_PATTERNS = [
  /ignore\s+previous|이전\s*지시|위\s*지시\s*무시/i,
  /system\s*[:\-]/i,
  /confirmImport|deleteAll|drop\s+table/i,
  /<\s*\/?\s*(system|user|assistant|tool)\s*>/i,
];

export function sanitizeCellValue(raw: unknown): string {
  if (raw == null) return '';
  let s = String(raw);
  // 제어 문자 제거 (탭/줄바꿈은 일부 허용)
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  // 길이 컷
  if (s.length > MAX_CELL_LEN) s = s.slice(0, MAX_CELL_LEN) + '…';
  return s;
}

/** 행 단위 sanitize. */
export function sanitizeRow(row: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(row)) out[k] = sanitizeCellValue(v);
  return out;
}

/** 의심 패턴 검출 — 디버깅/감사용. 차단 안 함 (false positive 많음). */
export function looksSuspicious(row: Record<string, unknown>): boolean {
  for (const v of Object.values(row)) {
    const s = String(v ?? '');
    for (const pat of INJECTION_PATTERNS) {
      if (pat.test(s)) return true;
    }
  }
  return false;
}
