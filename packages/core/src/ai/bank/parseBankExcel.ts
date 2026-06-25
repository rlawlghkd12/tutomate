import * as XLSX from 'xlsx';

/** 은행 거래내역에서 추출한 입금 1건. */
export interface BankTransaction {
  /** 원본 시트의 0-base 행 번호 (중복 저장 방지·추적용) */
  rowIndex: number;
  /** "2026.05.04 13:35:39" 형태 원문 */
  dateTime: string;
  /** YYYY-MM-DD 로 정규화한 날짜 (payment_records.paid_at 용) */
  paidAt: string;
  /** "내용" 컬럼 — 입금자명 (강좌+이름 조합이거나 이름만) */
  payerName: string;
  /** 입금액 (원) */
  amount: number;
  /** "적요" — 현금/인터넷/스마트/ＥＢ 등 입금 경로 */
  method: string;
  /** "비고" */
  memo: string;
}

export interface ParsedBankExcel {
  /** 통장명/계좌 등 요약 정보 (있으면) */
  accountName?: string;
  period?: string;
  /** 입금 거래만 (출금·취소 제외) */
  deposits: BankTransaction[];
  /** 출금/취소 등 입금이 아닌 행 수 (참고용) */
  nonDepositCount: number;
}

const HEADER_KEYS = ['거래일시', '내용', '입금'];

/**
 * 은행 거래내역(입금내역) 형식인지 빠르게 판별.
 * 일반 임포트 도구(parseExcelHeaders)가 잘못 호출됐을 때 전용 분석(analyzeBankDeposits)으로
 * 유도하기 위한 감지용 — "거래일시/내용/입금"을 모두 가진 행이 상단 어딘가 있으면 은행 양식.
 */
export function isBankStatementFormat(buffer: Uint8Array): boolean {
  try {
    const wb = XLSX.read(buffer, { type: 'array' });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) return false;
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], {
      header: 1,
      defval: '',
    });
    for (let i = 0; i < Math.min(aoa.length, 40); i++) {
      const cells = (aoa[i] ?? []).map((c) => String(c ?? '').trim());
      if (HEADER_KEYS.every((k) => cells.some((c) => c.includes(k)))) return true;
    }
    return false;
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

/** "40,000원" / "40000" / 40000 → 40000 (숫자 못 뽑으면 NaN) */
function toAmount(raw: unknown): number {
  if (typeof raw === 'number') return raw;
  const s = String(raw ?? '').replace(/[^\d.-]/g, '');
  if (!s) return NaN;
  return Number(s);
}

/**
 * 은행 거래내역 엑셀(KFCC 등)을 파싱해 입금 거래만 추출.
 *
 * 형식이 일반 표(첫 행=헤더)와 달라 헤더행 위치가 가변적이라,
 * "거래일시/내용/입금"을 모두 포함하는 행을 헤더로 자동 탐지한다.
 * 입금액 컬럼에 값이 있는 행만 deposit으로 본다(출금/취소 행 제외).
 */
export function parseBankExcel(buffer: Uint8Array): ParsedBankExcel {
  const wb = XLSX.read(buffer, { type: 'array' });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error('엑셀 파일에 시트가 없습니다.');
  const ws = wb.Sheets[sheetName];
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });

  // 헤더행 탐지 — "거래일시/내용/입금"을 모두 포함하는 행
  let headerRow = -1;
  for (let i = 0; i < aoa.length; i++) {
    const cells = (aoa[i] ?? []).map((c) => String(c ?? '').trim());
    if (HEADER_KEYS.every((k) => cells.some((c) => c.includes(k)))) {
      headerRow = i;
      break;
    }
  }
  if (headerRow === -1) {
    throw new Error(
      '은행 거래내역 형식을 인식하지 못했습니다. "거래일시/내용/입금" 컬럼이 있는 거래내역 엑셀인지 확인해주세요.',
    );
  }

  const header = (aoa[headerRow] as unknown[]).map((c) => String(c ?? '').trim());
  const col = (key: string) => header.findIndex((h) => h.includes(key));
  const idxDate = col('거래일시');
  const idxName = col('내용');
  const idxOut = col('출금');
  const idxIn = col('입금');
  const idxMethod = col('적요');
  const idxMemo = col('비고');

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

  const deposits: BankTransaction[] = [];
  let nonDepositCount = 0;
  for (let i = headerRow + 1; i < aoa.length; i++) {
    const row = aoa[i] as unknown[];
    if (!row || row.every((c) => c === '' || c == null)) continue;
    const dateTime = String(row[idxDate] ?? '').trim();
    // 거래일시가 날짜 형태가 아니면 데이터행이 아님 (소계/합계 등)
    if (!/^\d{4}[.\-/]\d{1,2}/.test(dateTime)) continue;

    const inAmt = toAmount(row[idxIn]);
    const outAmt = idxOut >= 0 ? toAmount(row[idxOut]) : NaN;
    // 입금 컬럼에 유효 금액이 없으면 입금건 아님 (출금/취소)
    if (!Number.isFinite(inAmt) || inAmt <= 0) {
      if (Number.isFinite(outAmt) && outAmt > 0) nonDepositCount++;
      continue;
    }

    deposits.push({
      rowIndex: i,
      dateTime,
      paidAt: toIsoDate(dateTime),
      payerName: String(row[idxName] ?? '').trim(),
      amount: inAmt,
      method: idxMethod >= 0 ? String(row[idxMethod] ?? '').trim() : '',
      memo: idxMemo >= 0 ? String(row[idxMemo] ?? '').trim() : '',
    });
  }

  return { accountName, period, deposits, nonDepositCount };
}
