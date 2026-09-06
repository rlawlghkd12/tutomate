import * as XLSX from 'xlsx';

/** 은행 거래내역에서 추출한 입금 1건. */
export interface BankTransaction {
  /** 원본 시트의 0-base 행 번호 (중복 저장 방지·추적용) */
  rowIndex: number;
  /** "2026.05.04 13:35:39" 형태 원문 */
  dateTime: string;
  /** YYYY-MM-DD 로 정규화한 날짜 (payment_records.paid_at 용) */
  paidAt: string;
  /** 입금자명 컬럼 값 (강좌+이름 조합이거나 이름만) */
  payerName: string;
  /** 입금 경로(현금/인터넷/스마트/ＥＢ 등) */
  method: string;
  /** 비고 */
  memo: string;
  /** 입금액 (원) */
  amount: number;
}

export interface ParsedBankExcel {
  /** 통장명/계좌 등 요약 정보 (있으면) */
  accountName?: string;
  period?: string;
  /** 입금 거래만 (출금·취소 제외) */
  deposits: BankTransaction[];
  /** 출금 거래만 (환불 처리 후보) — amount는 출금액(양수) */
  withdrawals: BankTransaction[];
  /** 입금도 출금도 아닌 행 수 (참고용) */
  nonDepositCount: number;
}

/**
 * 은행별 컬럼명 동의어 사전.
 * 은행마다 헤더가 제각각이라(국민 "맡기신금액", 농협 "거래기록사항", 카카오 "보낸분" …)
 * 고정 이름 대신 동의어로 역할을 찾는다. 우선순위 순서대로 먼저 맞는 것을 쓴다.
 * 한 컬럼이 두 역할에 겹쳐 잡히지 않도록 이미 쓴 컬럼은 제외한다(used set).
 */
const SYN = {
  date: ['거래일시', '거래일자', '거래날짜', '거래일', '일자', '일시', '날짜'],
  // 입금자명(보낸 사람) — '적요'는 은행마다 경로/이름이 갈려 여기 넣지 않음(오배정 방지)
  name: ['보낸분', '받는분', '의뢰인', '기재내용', '거래기록사항', '보내는분', '입금자', '상대방', '성명', '내용'],
  in: ['맡기신금액', '받으신금액', '받은금액', '입금액', '입금(원)', '입금금액', '입금'],
  out: ['찾으신금액', '보내신금액', '보낸금액', '출금액', '출금(원)', '출금금액', '출금'],
  method: ['적요', '거래종류', '거래구분', '거래유형'],
  memo: ['비고', '통장메모', '내통장표시', '메모'],
  // 입/출금이 한 컬럼(금액)이고 방향이 별도 컬럼(구분)인 은행(카카오/토스 등) 대응
  amount: ['거래금액', '금액'],
  dir: ['입출구분', '입출금구분', '거래구분', '유형', '구분'],
} as const;

const squish = (s: string) => s.replace(/\s+/g, '');

/** 헤더 배열에서 동의어로 컬럼 인덱스를 찾되, 이미 쓴 컬럼은 건너뛴다. */
function findCol(header: string[], syns: readonly string[], used: Set<number>): number {
  for (const syn of syns) {
    const key = squish(syn);
    for (let i = 0; i < header.length; i++) {
      if (used.has(i)) continue;
      if (squish(header[i]).includes(key)) {
        used.add(i);
        return i;
      }
    }
  }
  return -1;
}

export interface BankColumns {
  idxDate: number;
  idxName: number;
  idxIn: number;
  idxOut: number;
  idxMethod: number;
  idxMemo: number;
  idxAmount: number;
  idxDir: number;
}

/** 역할 이름 목록 — LLM/수동 매핑이 채워야 할 대상. UI·프롬프트 공유. */
export type BankRole = 'date' | 'name' | 'in' | 'out' | 'method' | 'memo' | 'amount' | 'dir';

/** LLM/수동으로 제시하는 매핑: 역할 → 헤더 문자열(그 행에 실제 존재하는 헤더명). */
export type BankRoleMapping = Partial<Record<BankRole, string>>;

/** 헤더 행에서 각 역할 컬럼을 해석. 날짜+금액(입금 or 금액+구분)을 못 찾으면 null(=은행 양식 아님). */
function resolveColumns(header: string[]): BankColumns | null {
  const used = new Set<number>();
  const idxDate = findCol(header, SYN.date, used);
  const idxIn = findCol(header, SYN.in, used);
  const idxOut = findCol(header, SYN.out, used);
  const idxAmount = idxIn < 0 ? findCol(header, SYN.amount, used) : -1;
  const idxDir = idxIn < 0 ? findCol(header, SYN.dir, used) : -1;
  const idxName = findCol(header, SYN.name, used);
  const idxMethod = findCol(header, SYN.method, used);
  const idxMemo = findCol(header, SYN.memo, used);

  // 날짜 + (입금 컬럼) 또는 (금액+방향 컬럼)이 있어야 신뢰할 수 있는 거래내역으로 본다.
  const hasAmount = idxIn >= 0 || (idxAmount >= 0 && idxDir >= 0);
  if (idxDate < 0 || !hasAmount || idxName < 0) return null;
  return { idxDate, idxName, idxIn, idxOut, idxMethod, idxMemo, idxAmount, idxDir };
}

/** aoa에서 헤더행 위치와 컬럼 해석을 함께 찾는다(상단 40행 내). */
function detectHeader(aoa: unknown[][]): { headerRow: number; cols: BankColumns } | null {
  const scan = Math.min(aoa.length, 40);
  for (let i = 0; i < scan; i++) {
    const cells = (aoa[i] ?? []).map((c) => String(c ?? '').trim());
    const cols = resolveColumns(cells);
    if (cols) return { headerRow: i, cols };
  }
  return null;
}

/**
 * 명시적 역할→헤더명 매핑(LLM/수동)으로 컬럼 인덱스를 해석한다.
 * 동의어 사전으로 못 잡은 새 은행 양식을, 사용자 확인을 거친 매핑으로 파싱하기 위한 경로.
 * 실제 헤더에 없는 이름을 지목하거나 날짜/금액/이름을 못 채우면 null(안전 실패).
 */
export function resolveColumnsFromRoles(header: string[], roles: BankRoleMapping): BankColumns | null {
  const used = new Set<number>();
  const find = (name?: string): number => {
    if (!name) return -1;
    const key = squish(name);
    // 정확 일치 우선, 없으면 포함. 이미 쓴 컬럼 제외(겹침 방지).
    for (const pass of ['exact', 'incl'] as const) {
      for (let i = 0; i < header.length; i++) {
        if (used.has(i)) continue;
        const h = squish(header[i]);
        if ((pass === 'exact' && h === key) || (pass === 'incl' && h.includes(key))) {
          used.add(i);
          return i;
        }
      }
    }
    return -1;
  };
  const idxDate = find(roles.date);
  const idxIn = find(roles.in);
  const idxOut = find(roles.out);
  const idxAmount = idxIn < 0 ? find(roles.amount) : -1;
  const idxDir = idxIn < 0 ? find(roles.dir) : -1;
  const idxName = find(roles.name);
  const idxMethod = find(roles.method);
  const idxMemo = find(roles.memo);

  const hasAmount = idxIn >= 0 || (idxAmount >= 0 && idxDir >= 0);
  if (idxDate < 0 || !hasAmount || idxName < 0) return null;
  return { idxDate, idxName, idxIn, idxOut, idxMethod, idxMemo, idxAmount, idxDir };
}

/** 시트를 문자열 aoa로 읽는다(상단 N행). LLM/수동 매핑에 헤더 후보를 넘길 때 사용. */
export function readBankSheetRows(buffer: Uint8Array, maxRows = 15): string[][] {
  const wb = XLSX.read(buffer, { type: 'array' });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], { header: 1, defval: '' }) as unknown[][];
  return aoa.slice(0, maxRows).map((r) => (r ?? []).map((c) => String(c ?? '').trim()));
}

/**
 * 은행 거래내역(입금내역) 형식인지 빠르게 판별.
 * 일반 임포트 도구가 잘못 호출됐을 때 전용 분석(analyzeBankDeposits)으로 유도하기 위한 감지용.
 */
export function isBankStatementFormat(buffer: Uint8Array): boolean {
  try {
    const wb = XLSX.read(buffer, { type: 'array' });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) return false;
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], { header: 1, defval: '' });
    return detectHeader(aoa as unknown[][]) !== null;
  } catch {
    return false;
  }
}

/** "2026.05.04 13:35:39" / "2026-05-04" 등 → "2026-05-04" */
function toIsoDate(raw: string): string {
  const m = String(raw).match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  if (!m) return '';
  const [, y, mo, d] = m;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

/** "40,000원" / "40000" / 40000 / "-40000" → 숫자 (못 뽑으면 NaN) */
function toAmount(raw: unknown): number {
  if (typeof raw === 'number') return raw;
  const s = String(raw ?? '').replace(/[^\d.-]/g, '');
  if (!s || s === '-' || s === '.') return NaN;
  return Number(s);
}

/**
 * 은행 거래내역 엑셀을 파싱해 입금/출금 거래를 추출.
 *
 * 은행마다 헤더 위치·컬럼명이 달라, 동의어 사전으로 헤더행과 역할 컬럼을 자동 해석한다.
 * (거래일시/거래일자, 입금/맡기신금액, 내용/보낸분/거래기록사항 등)
 * 입금·출금이 한 컬럼(금액)이고 방향이 별도 컬럼(구분)인 은행도 지원한다.
 * 확실히 해석 못 하면 조용히 잘못 저장하지 않고 명확히 실패시킨다(안전).
 */
export function parseBankExcel(buffer: Uint8Array, override?: BankParseOverride): ParsedBankExcel {
  const wb = XLSX.read(buffer, { type: 'array' });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error('엑셀 파일에 시트가 없습니다.');
  const ws = wb.Sheets[sheetName];
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][];

  // 1) 사전 자동 탐지. 2) 실패 시, 넘어온 명시적 매핑(LLM/수동)이 있으면 그것으로 해석.
  let resolved = detectHeader(aoa);
  if (!resolved && override) {
    const cells = (aoa[override.headerRow] ?? []).map((c) => String(c ?? '').trim());
    const cols = resolveColumnsFromRoles(cells, override.roles);
    if (cols) resolved = { headerRow: override.headerRow, cols };
  }
  if (!resolved) {
    throw new Error(
      '은행 거래내역 형식을 인식하지 못했습니다. 날짜·입금액·입금자(내용) 컬럼이 있는 거래내역 엑셀인지 확인해주세요.',
    );
  }
  const { headerRow, cols } = resolved;

  // 요약 정보(통장명/조회기간)는 헤더행 위쪽에서 best-effort로 긁는다.
  let accountName: string | undefined;
  let period: string | undefined;
  for (let i = 0; i < headerRow; i++) {
    const cells = (aoa[i] ?? []).map((c) => String(c ?? '').trim());
    const joined = cells.join(' ');
    if (!accountName && joined.includes('예금주')) {
      accountName = cells.find((_, k) => k > 0 && cells[k - 1].includes('예금주명'));
    }
    const pm = joined.match(/조회기간\s*[:：]?\s*([\d.]+\s*~\s*[\d.]+)/);
    if (pm) period = pm[1].trim();
  }

  const { deposits, withdrawals, nonDepositCount } = parseBankRows(aoa, headerRow, cols);
  return { accountName, period, deposits, withdrawals, nonDepositCount };
}

/** 사전 실패 시 넘기는 명시적 매핑(LLM 헤더 매핑/수동 지정 결과). */
export interface BankParseOverride {
  headerRow: number;
  roles: BankRoleMapping;
}

const isInDir = (v: string) => /입금|받/.test(v);
const isOutDir = (v: string) => /출금|보|이체출|지급/.test(v);

/** 해석된 컬럼으로 데이터 행을 입금/출금으로 분류. (자동·수동·LLM 경로 공통) */
export function parseBankRows(
  aoa: unknown[][],
  headerRow: number,
  cols: BankColumns,
): { deposits: BankTransaction[]; withdrawals: BankTransaction[]; nonDepositCount: number } {
  const { idxDate, idxName, idxIn, idxOut, idxMethod, idxMemo, idxAmount, idxDir } = cols;
  const deposits: BankTransaction[] = [];
  const withdrawals: BankTransaction[] = [];
  let nonDepositCount = 0;
  for (let i = headerRow + 1; i < aoa.length; i++) {
    const row = aoa[i] as unknown[];
    if (!row || row.every((c) => c === '' || c == null)) continue;
    const dateTime = String(row[idxDate] ?? '').trim();
    // 거래일시가 날짜 형태가 아니면 데이터행이 아님 (소계/합계 등)
    if (!/^\d{4}[.\-/]\d{1,2}/.test(dateTime)) continue;

    const base = {
      rowIndex: i,
      dateTime,
      paidAt: toIsoDate(dateTime),
      payerName: String(row[idxName] ?? '').trim(),
      method: idxMethod >= 0 ? String(row[idxMethod] ?? '').trim() : '',
      memo: idxMemo >= 0 ? String(row[idxMemo] ?? '').trim() : '',
    };

    if (idxIn >= 0) {
      // 입금/출금 별도 컬럼
      const inAmt = toAmount(row[idxIn]);
      const outAmt = idxOut >= 0 ? toAmount(row[idxOut]) : NaN;
      if (Number.isFinite(inAmt) && inAmt > 0) deposits.push({ ...base, amount: inAmt });
      else if (Number.isFinite(outAmt) && outAmt > 0) withdrawals.push({ ...base, amount: outAmt });
      else nonDepositCount++;
    } else {
      // 금액 한 컬럼 + 방향(구분) 컬럼: 구분 값으로 입/출 판정, 없으면 부호로 판정
      const amt = toAmount(row[idxAmount]);
      const dir = idxDir >= 0 ? String(row[idxDir] ?? '').trim() : '';
      if (!Number.isFinite(amt) || amt === 0) {
        nonDepositCount++;
        continue;
      }
      const deposit = dir ? isInDir(dir) : amt > 0;
      const withdrawal = dir ? isOutDir(dir) : amt < 0;
      if (deposit) deposits.push({ ...base, amount: Math.abs(amt) });
      else if (withdrawal) withdrawals.push({ ...base, amount: Math.abs(amt) });
      else nonDepositCount++;
    }
  }
  return { deposits, withdrawals, nonDepositCount };
}
