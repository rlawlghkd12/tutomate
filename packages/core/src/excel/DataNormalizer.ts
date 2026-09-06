import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import type { NormalizationError, NormalizedRow, StandardField } from './types';

dayjs.extend(customParseFormat);

export type ColumnMapping = Record<string, StandardField>;

// 전화는 매칭용 키(자릿수 동등비교)로만 쓰인다. 010이든 legacy(011/016/017/018/019)든
// 유선(02, 031…)이든 숫자만 뽑아 보존한다 — 형식 검증으로 행 전체를 버리지 않기 위함.
const PHONE_RE = /^010\d{8}$/;
// 전화 파싱 실패는 행 전체를 무효화하지 않는다(선택 필드). 이름/금액/날짜로 계속 진행.
const NON_FATAL_FIELDS = new Set<StandardField>(['phone', 'parentPhone']);
const DATE_FORMATS = [
  'YYYY-MM-DD', 'YYYY.MM.DD', 'YYYY/MM/DD',
  'YY-MM-DD', 'YY.MM.DD', 'YY/MM/DD',
  'YYYY-M-D', 'YYYY.M.D', 'YYYY/M/D',
  'YY-M-D', 'YY.M.D', 'YY/M/D',
];

function normalizePhone(raw: string): string | null {
  let digits = raw.replace(/\D+/g, '');
  if (digits.startsWith('82')) digits = '0' + digits.slice(2);
  if (PHONE_RE.test(digits)) return digits; // 표준 010 → 정규형
  // legacy·유선 등 비표준이라도 숫자가 있으면 매칭 키로 보존(형식 오류로 버리지 않음).
  return digits.length > 0 ? digits : null;
}

function normalizeDate(raw: string): string | null {
  const trimmed = raw.trim();
  // M월 D일 (선택적 YYYY년 prefix)
  const m = trimmed.match(/^(?:(\d{2,4})\s*년\s*)?(\d{1,2})\s*월\s*(\d{1,2})\s*일$/);
  if (m) {
    let y = m[1];
    if (!y) y = String(new Date().getFullYear());
    if (y.length === 2) y = '20' + y;
    const month = m[2].padStart(2, '0');
    const day = m[3].padStart(2, '0');
    return `${y}-${month}-${day}`;
  }
  for (const fmt of DATE_FORMATS) {
    const d = dayjs(trimmed, fmt, true);
    if (d.isValid()) return d.format('YYYY-MM-DD');
  }
  return null;
}

function normalizeAmount(raw: string): number | null {
  let s = raw.replace(/[₩,\s]/g, '');
  const manMatch = s.match(/^(\d+(?:\.\d+)?)만원?$/);
  if (manMatch) return Math.round(parseFloat(manMatch[1]) * 10000);
  const cheonMatch = s.match(/^(\d+(?:\.\d+)?)천원?$/);
  if (cheonMatch) return Math.round(parseFloat(cheonMatch[1]) * 1000);
  s = s.replace(/원$/, '');
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

function normalizeName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

export function normalizeRow(
  row: Record<string, unknown>,
  mapping: ColumnMapping,
): NormalizedRow {
  const data: NormalizedRow['data'] = {};
  const errors: NormalizationError[] = [];

  for (const [colName, stdField] of Object.entries(mapping)) {
    const raw = row[colName];
    if (raw == null || raw === '') continue;
    // 엑셀 날짜형 셀은 Date로 들어온다(cellDates). 지역시(KST 등) 기준 날짜로 문자열화해
    // 이후 날짜 파서가 그대로 처리하게 한다. (숫자/문자는 종전대로 문자열화)
    const s = raw instanceof Date ? dayjs(raw).format('YYYY-MM-DD') : String(raw);

    let value: string | number | null = null;
    switch (stdField) {
      case 'phone':
      case 'parentPhone':
        value = normalizePhone(s);
        break;
      case 'birthDate':
      case 'enrollmentDate':
      case 'paymentDate':
        value = normalizeDate(s);
        break;
      case 'amount':
        value = normalizeAmount(s);
        break;
      case 'name':
        value = normalizeName(s);
        break;
      default:
        value = s.trim();
    }

    if (value === null || (typeof value === 'string' && value === '')) {
      // 선택 필드(전화 등)의 파싱 실패는 행 전체를 무효화하지 않고 조용히 생략한다.
      if (NON_FATAL_FIELDS.has(stdField)) continue;
      errors.push({
        field: stdField,
        rawValue: raw,
        message: `'${stdField}' 변환 실패: "${s}"`,
      });
    } else {
      data[stdField] = value;
    }
  }

  return { data, errors };
}
