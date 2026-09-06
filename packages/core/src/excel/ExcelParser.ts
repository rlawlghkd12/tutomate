import * as XLSX from 'xlsx';
import type { ParsedExcel } from './types';

/** xlsx(PK zip) 또는 구형 xls(OLE, D0CF) 시그니처면 바이너리 엑셀. 아니면 CSV/텍스트로 본다. */
function isBinaryWorkbook(buf: Uint8Array): boolean {
  return (buf[0] === 0x50 && buf[1] === 0x4b) || (buf[0] === 0xd0 && buf[1] === 0xcf);
}

/**
 * CSV/텍스트 버퍼를 인코딩 자동 감지해 문자열로 디코드. (FR-1: 한글 CSV 깨짐 방지)
 * - UTF-8 BOM(EF BB BF)이면 UTF-8, BOM 제거.
 * - 아니면 UTF-8 엄격 디코드 시도 → 실패하면 EUC-KR(cp949)로 폴백.
 */
export function decodeTextBuffer(buffer: Uint8Array): string {
  if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(buffer.subarray(3));
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    try {
      return new TextDecoder('euc-kr').decode(buffer);
    } catch {
      // euc-kr 디코더 미지원 환경 — 관대한 UTF-8로 폴백(치환문자 포함될 수 있음)
      return new TextDecoder('utf-8').decode(buffer);
    }
  }
}

/** 헤더행에 흔히 등장하는 도메인 키워드(정규화 비교). 제목/설명행과 구분하는 신호. */
const HEADER_KEYWORDS = [
  '이름', '성명', '성함', '학생', '회원',
  '전화', '연락처', '휴대폰', '핸드폰', '번호',
  '금액', '납부', '결제', '수강료', '회비',
  '날짜', '일자', '납부일', '결제일',
  '강좌', '강의', '반', '과목', '클래스',
  '이메일', '메일', '생년', '생일', '주소', '비고', '메모',
];

/**
 * 헤더행 자동 탐지 (FR-1: 제목/안내행이 위에 있어도 진짜 헤더를 찾는다).
 * 상위 최대 12행 중 도메인 키워드가 가장 많이 맞는 행을 헤더로 본다.
 * 키워드가 하나도 안 맞으면 첫 비어있지 않은 행으로 폴백(기존 동작).
 */
export function detectHeaderRow(aoa: unknown[][]): number {
  const scan = Math.min(aoa.length, 12);
  let bestIdx = -1;
  let bestScore = 0;
  for (let i = 0; i < scan; i++) {
    const cells = (aoa[i] ?? []).map((c) => String(c ?? '').replace(/\s/g, ''));
    const nonEmpty = cells.filter((c) => c.length > 0);
    if (nonEmpty.length < 2) continue; // 제목 한 칸짜리 행은 헤더 후보 아님
    let score = 0;
    for (const c of nonEmpty) {
      if (HEADER_KEYWORDS.some((k) => c.includes(k))) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  if (bestIdx >= 0) return bestIdx;
  // 폴백 — 첫 비어있지 않은 행
  for (let i = 0; i < aoa.length; i++) {
    const row = aoa[i] ?? [];
    if (row.some((c) => String(c ?? '').trim().length > 0)) return i;
  }
  return 0;
}

/** 시트의 "데이터스러움" 점수 — 헤더 키워드 수(가중)+데이터 행 수. 시트 선택용. */
function sheetScore(aoa: unknown[][]): number {
  if (aoa.length === 0) return -1;
  const hi = detectHeaderRow(aoa);
  const cells = (aoa[hi] ?? []).map((c) => String(c ?? '').replace(/\s/g, ''));
  const kw = cells.filter((c) => c.length > 0 && HEADER_KEYWORDS.some((k) => c.includes(k))).length;
  let dataRows = 0;
  for (let i = hi + 1; i < aoa.length; i++) {
    if ((aoa[i] ?? []).some((c) => String(c ?? '').trim().length > 0)) dataRows++;
  }
  return kw * 100 + Math.min(dataRows, 50);
}

/** 워크북에서 가장 데이터스러운 시트의 aoa를 반환. 동점/무점수면 첫 시트. */
function pickBestSheet(wb: XLSX.WorkBook): unknown[][] {
  let best: unknown[][] | null = null;
  let bestScore = -Infinity;
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });
    const score = sheetScore(aoa);
    if (score > bestScore) {
      bestScore = score;
      best = aoa;
    }
  }
  if (best) return best;
  const first = wb.Sheets[wb.SheetNames[0]];
  return first ? XLSX.utils.sheet_to_json<unknown[]>(first, { header: 1, defval: '' }) : [];
}

export function parseExcel(buffer: Uint8Array): ParsedExcel {
  // CSV/텍스트면 인코딩을 감지해 문자열로 읽는다(EUC-KR 한글 깨짐 방지). 엑셀 바이너리는 그대로.
  // cellDates: 엑셀 '날짜형' 셀을 시리얼 숫자(예 45899)가 아니라 Date로 받는다.
  // (사용자가 결제일 칸에 날짜를 입력하면 대개 날짜형 셀 → 시리얼로 오면 날짜 파싱 실패로 행이 통째 버려짐)
  const wb = isBinaryWorkbook(buffer)
    ? XLSX.read(buffer, { type: 'array', cellDates: true })
    : XLSX.read(decodeTextBuffer(buffer), { type: 'string', cellDates: true });
  if (wb.SheetNames.length === 0) {
    throw new Error('엑셀 파일에 시트가 없습니다.');
  }
  // 다중 시트 — 헤더 키워드·데이터 행이 가장 많은 시트를 선택(빈/안내 시트 건너뜀). 동점이면 앞 시트.
  const aoa = pickBestSheet(wb);

  if (aoa.length === 0) {
    throw new Error('엑셀 파일이 비어있습니다. 첫 행에 헤더가 있어야 합니다.');
  }

  // 헤더행 자동 탐지 — 제목/안내행이 맨 위에 있어도 진짜 헤더를 찾는다.
  const headerRowIdx = detectHeaderRow(aoa);
  // 빈 헤더 셀을 걸러내되 원래 열 인덱스를 보존한다.
  // (필터 후 배열 위치로 데이터를 읽으면, 헤더 중간에 빈 칸이 있을 때 이후 열이 통째로 밀려 오매핑됨)
  const headerCols = (aoa[headerRowIdx] as unknown[])
    .map((h, i) => ({ header: String(h ?? '').trim(), col: i }))
    .filter((x) => x.header.length > 0);
  const headers = headerCols.map((x) => x.header);

  if (headers.length === 0) {
    throw new Error('엑셀에서 헤더 행을 찾을 수 없습니다.');
  }

  const rows: Record<string, unknown>[] = [];
  for (let i = headerRowIdx + 1; i < aoa.length; i++) {
    const row = aoa[i] as unknown[];
    if (!row || row.every((c) => c === '' || c == null)) continue;
    const obj: Record<string, unknown> = {};
    for (const { header, col } of headerCols) {
      obj[header] = row[col] ?? '';
    }
    rows.push(obj);
  }
  return { headers, rows };
}
