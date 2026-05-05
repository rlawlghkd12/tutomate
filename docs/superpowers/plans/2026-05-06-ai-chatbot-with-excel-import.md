# AI 챗봇 (엑셀 임포트 통합) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 학원/교습소 등 수강 관리 조직을 위한 챗봇을 구현한다. 자연어 조회·요약 + 엑셀 첨부 임포트(매핑·미리보기·확정)를 풀로컬 LLM(Qwen 2.5 3B + node-llama-cpp)으로 한 번에 출시.

**Architecture:** Electron 메인 프로세스에서 node-llama-cpp가 모델 추론과 도구 호출을 담당. 도구는 두 종류: 조회 도구(Supabase 검색) + 임포트 도구(Excel 파싱·매핑·정규화·UPSERT). Renderer는 메시지 + 스마트 카드(미리보기/결과/매핑오류) UI. 첨부 파일은 FileStash에 임시 저장하고 fileId만 LLM에 전달.

**Tech Stack:** TypeScript, Electron, React 19, Vitest, Supabase, Zustand, xlsx (sheetjs, 이미 ui 패키지에 존재), node-llama-cpp (신규), zod (신규), Hugging Face GGUF 직접 다운로드.

**Spec:** `docs/superpowers/specs/2026-05-06-excel-import-ai-chatbot-design.md`

---

## File Structure (전체 신규/수정 파일 맵)

신규 (코어):
```
packages/core/src/excel/
  types.ts
  ExcelParser.ts
  DataNormalizer.ts
  index.ts
  __tests__/ExcelParser.test.ts
  __tests__/DataNormalizer.test.ts

packages/core/src/mapping/
  synonyms.ts
  ColumnMapper.ts
  mappingCacheStore.ts
  index.ts
  __tests__/ColumnMapper.test.ts
  __tests__/synonyms.test.ts

packages/core/src/ai/
  types.ts
  ToolCatalog.ts
  ActionDispatcher.ts
  tools/{searchStudent,getStudent,getPaymentHistory,getUnpaidStudents,
         getAttendance,getEnrollment,listClasses,getClassRoster,
         getMonthlySummary,getStudentSummary,
         parseExcelHeaders,mapColumns,previewImport,confirmImport}.ts
  index.ts
  __tests__/ActionDispatcher.test.ts
  __tests__/tools/queryTools.test.ts
  __tests__/tools/importTools.test.ts
```

신규 (메인 프로세스):
```
packages/electron-shared/src/ai/
  HardwareDiagnostic.ts
  ModelManager.ts
  LlamaRuntime.ts
  FileStash.ts
  index.ts
  __tests__/HardwareDiagnostic.test.ts
  __tests__/FileStash.test.ts
```

신규 (앱):
```
apps/tutomate/electron/ipc/aiHandler.ts
apps/tutomate/electron/ipc/fileStashHandler.ts
apps/tutomate-q/electron/ipc/aiHandler.ts (동일)
apps/tutomate-q/electron/ipc/fileStashHandler.ts (동일)

apps/tutomate/src/pages/ai-chat/
  AiChatPage.tsx
  components/ChatWindow.tsx
  components/MessageBubble.tsx
  components/ChatInput.tsx
  components/ModelDownloadModal.tsx
  components/DirectImportFallback.tsx
  components/SmartCard/ImportPreviewCard.tsx
  components/SmartCard/ImportResultCard.tsx
  components/SmartCard/MappingErrorCard.tsx
  components/SmartCard/SourceLinkCard.tsx
apps/tutomate-q/src/pages/ai-chat/ ... (동일 구조, 라우트만 등록)

public/templates/tutomate-import-template.xlsx
supabase/migrations/20260506000000_mapping_profiles.sql
```

수정:
```
packages/electron-shared/src/preload.ts          (window.electronAPI에 ai:* / file-stash:save 노출)
packages/electron-shared/src/ipc/index.ts        (등록 함수 export)
packages/core/src/index.ts                       (excel/mapping/ai 모듈 re-export)
packages/core/package.json                       (zod 의존)
packages/electron-shared/package.json            (node-llama-cpp 의존)
apps/tutomate/electron/main.ts                   (IPC 등록)
apps/tutomate-q/electron/main.ts                 (IPC 등록)
apps/tutomate/src/App.tsx                        (라우트 추가: /ai-chat)
apps/tutomate-q/src/App.tsx                      (동일)
```

---

## Phase 0 — 의존성·DB·정적 자산

### Task 0.1: 의존성 설치

**Files:**
- Modify: `packages/core/package.json`
- Modify: `packages/electron-shared/package.json`

- [ ] **Step 1: zod 추가 (core)**

```bash
pnpm --filter @tutomate/core add zod@^3.23.0
```

- [ ] **Step 2: node-llama-cpp 추가 (electron-shared)**

```bash
pnpm --filter @tutomate/electron-shared add node-llama-cpp@^3.4.0
```

- [ ] **Step 3: 빌드 확인**

```bash
pnpm -r build || true   # 타입 체크 통과 확인
pnpm test               # 기존 테스트 깨지지 않는지
```

Expected: 기존 테스트 모두 통과.

- [ ] **Step 4: 커밋**

```bash
git add packages/core/package.json packages/electron-shared/package.json pnpm-lock.yaml
git commit -m "chore: add zod and node-llama-cpp deps"
```

---

### Task 0.2: Supabase 마이그레이션 — mapping_profiles

**Files:**
- Create: `supabase/migrations/20260506000000_mapping_profiles.sql`

- [ ] **Step 1: 마이그레이션 SQL 작성**

```sql
-- 엑셀 임포트 컬럼 매핑 캐시
create table if not exists mapping_profiles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  signature text not null,
  mapping jsonb not null,
  created_at timestamptz not null default now(),
  unique (org_id, signature)
);

create index if not exists idx_mapping_profiles_org on mapping_profiles(org_id);

alter table mapping_profiles enable row level security;

create policy "org members read mapping_profiles"
  on mapping_profiles for select
  using (org_id in (select org_id from org_members where user_id = auth.uid()));

create policy "org members insert mapping_profiles"
  on mapping_profiles for insert
  with check (org_id in (select org_id from org_members where user_id = auth.uid()));
```

- [ ] **Step 2: 로컬 적용 + 검증**

```bash
supabase db push        # 또는 supabase migration up
```

Expected: `mapping_profiles` 테이블 생성됨. RLS 정책 활성.

- [ ] **Step 3: 커밋**

```bash
git add supabase/migrations/20260506000000_mapping_profiles.sql
git commit -m "feat(db): add mapping_profiles table for column mapping cache"
```

---

### Task 0.3: 표준 양식 템플릿 파일

**Files:**
- Create: `public/templates/tutomate-import-template.xlsx`

- [ ] **Step 1: 표준 컬럼 정의 + xlsx 생성 스크립트**

`scripts/generate-import-template.ts`:
```typescript
import * as XLSX from 'xlsx';
import path from 'node:path';

const headers = [
  '이름', '연락처', '학부모연락처', '생년월일',
  '등록일', '결제일', '금액', '결제수단', '비고',
  '수강반', '과정',
];
const example = [
  '홍길동', '01012345678', '01087654321', '2010-03-15',
  '2025-03-01', '2025-04-05', '120000', '카드', '',
  '초등 수학', '봄학기',
];

const ws = XLSX.utils.aoa_to_sheet([headers, example]);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, '수강생');
const out = path.resolve('public/templates/tutomate-import-template.xlsx');
XLSX.writeFile(wb, out);
console.log('wrote', out);
```

- [ ] **Step 2: 실행**

```bash
mkdir -p public/templates
npx tsx scripts/generate-import-template.ts
```

- [ ] **Step 3: 커밋**

```bash
git add public/templates/tutomate-import-template.xlsx scripts/generate-import-template.ts
git commit -m "feat: add standard import template (xlsx)"
```

---

## Phase 1 — Excel 파싱·정규화 (LLM 무관, 단독 검증 가능)

### Task 1.1: 표준 필드 타입 정의

**Files:**
- Create: `packages/core/src/excel/types.ts`

- [ ] **Step 1: 타입 작성**

```typescript
// packages/core/src/excel/types.ts
export type StandardField =
  | 'name' | 'phone' | 'parentPhone' | 'birthDate'
  | 'enrollmentDate' | 'paymentDate' | 'amount'
  | 'paymentMethod' | 'note' | 'className' | 'tuitionPlan';

export const STANDARD_FIELDS: StandardField[] = [
  'name', 'phone', 'parentPhone', 'birthDate',
  'enrollmentDate', 'paymentDate', 'amount',
  'paymentMethod', 'note', 'className', 'tuitionPlan',
];

export interface ParsedExcel {
  headers: string[];
  rows: Record<string, unknown>[];
}

export interface NormalizationError {
  field: StandardField;
  rawValue: unknown;
  message: string;
}

export interface NormalizedRow {
  data: Partial<Record<StandardField, string | number>>;
  errors: NormalizationError[];
}
```

- [ ] **Step 2: 커밋**

```bash
git add packages/core/src/excel/types.ts
git commit -m "feat(excel): add StandardField + parsed/normalized types"
```

---

### Task 1.2: ExcelParser — 실패 테스트

**Files:**
- Create: `packages/core/src/excel/__tests__/ExcelParser.test.ts`

- [ ] **Step 1: 테스트 작성**

```typescript
import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseExcel } from '../ExcelParser';

function buildBuffer(rows: unknown[][]): Uint8Array {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
}

describe('parseExcel', () => {
  it('헤더 + 데이터 행 정상 파싱', () => {
    const buf = buildBuffer([
      ['이름', '연락처'],
      ['홍길동', '01012345678'],
      ['김민준', '01098765432'],
    ]);
    const result = parseExcel(buf);
    expect(result.headers).toEqual(['이름', '연락처']);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toEqual({ '이름': '홍길동', '연락처': '01012345678' });
  });

  it('빈 시트 → 에러', () => {
    const buf = buildBuffer([]);
    expect(() => parseExcel(buf)).toThrow(/헤더/);
  });

  it('헤더 행만 있는 경우 → rows 빈 배열', () => {
    const buf = buildBuffer([['이름', '연락처']]);
    const result = parseExcel(buf);
    expect(result.rows).toEqual([]);
  });
});
```

- [ ] **Step 2: 실패 확인**

```bash
pnpm --filter @tutomate/core test -- ExcelParser
```

Expected: FAIL ("Cannot find module" / "parseExcel not exported").

---

### Task 1.3: ExcelParser 구현

**Files:**
- Create: `packages/core/src/excel/ExcelParser.ts`

- [ ] **Step 1: 구현**

```typescript
// packages/core/src/excel/ExcelParser.ts
import * as XLSX from 'xlsx';
import type { ParsedExcel } from './types';

export function parseExcel(buffer: Uint8Array): ParsedExcel {
  const wb = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = wb.SheetNames[0];
  if (!firstSheetName) {
    throw new Error('엑셀 파일에 시트가 없습니다.');
  }
  const ws = wb.Sheets[firstSheetName];
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });

  if (aoa.length === 0) {
    throw new Error('엑셀 파일이 비어있습니다. 첫 행에 헤더가 있어야 합니다.');
  }

  const headers = (aoa[0] as unknown[]).map((h) => String(h ?? '').trim()).filter((h) => h.length > 0);
  if (headers.length === 0) {
    throw new Error('엑셀 첫 행에서 헤더를 찾을 수 없습니다.');
  }

  const rows: Record<string, unknown>[] = [];
  for (let i = 1; i < aoa.length; i++) {
    const row = aoa[i] as unknown[];
    if (!row || row.every((c) => c === '' || c == null)) continue;
    const obj: Record<string, unknown> = {};
    headers.forEach((h, idx) => {
      obj[h] = row[idx] ?? '';
    });
    rows.push(obj);
  }
  return { headers, rows };
}
```

- [ ] **Step 2: 통과 확인**

```bash
pnpm --filter @tutomate/core test -- ExcelParser
```

Expected: 3 PASS.

- [ ] **Step 3: 커밋**

```bash
git add packages/core/src/excel/types.ts packages/core/src/excel/ExcelParser.ts \
        packages/core/src/excel/__tests__/ExcelParser.test.ts
git commit -m "feat(excel): parseExcel — xlsx buffer to headers+rows"
```

---

### Task 1.4: DataNormalizer — 실패 테스트

**Files:**
- Create: `packages/core/src/excel/__tests__/DataNormalizer.test.ts`

- [ ] **Step 1: 테스트 작성**

```typescript
import { describe, it, expect } from 'vitest';
import { normalizeRow } from '../DataNormalizer';

describe('normalizeRow', () => {
  it('전화번호 다양한 포맷 → 01012345678', () => {
    const cases = ['010-1234-5678', '010 1234 5678', '01012345678', '+82 10-1234-5678'];
    for (const raw of cases) {
      const r = normalizeRow({ phone: raw }, { phone: 'phone' });
      expect(r.data.phone).toBe('01012345678');
      expect(r.errors).toHaveLength(0);
    }
  });

  it('비표준 전화번호 → 에러', () => {
    const r = normalizeRow({ phone: '02-1234' }, { phone: 'phone' });
    expect(r.data.phone).toBeUndefined();
    expect(r.errors[0]).toMatchObject({ field: 'phone' });
  });

  it('날짜 다양한 포맷 → ISO', () => {
    const cases: [string, string][] = [
      ['2025-04-05', '2025-04-05'],
      ['2025.4.5', '2025-04-05'],
      ['2025/04/05', '2025-04-05'],
      ['25.4.5', '2025-04-05'],
    ];
    for (const [raw, expected] of cases) {
      const r = normalizeRow({ d: raw }, { d: 'paymentDate' });
      expect(r.data.paymentDate).toBe(expected);
    }
  });

  it('금액 콤마/원/만원 처리', () => {
    expect(normalizeRow({ a: '120,000원' }, { a: 'amount' }).data.amount).toBe(120000);
    expect(normalizeRow({ a: '12만원' }, { a: 'amount' }).data.amount).toBe(120000);
    expect(normalizeRow({ a: '₩50,000' }, { a: 'amount' }).data.amount).toBe(50000);
  });

  it('이름 공백 정규화', () => {
    const r = normalizeRow({ n: '  홍  길동  ' }, { n: 'name' });
    expect(r.data.name).toBe('홍 길동');
  });
});
```

- [ ] **Step 2: 실패 확인**

```bash
pnpm --filter @tutomate/core test -- DataNormalizer
```

Expected: FAIL.

---

### Task 1.5: DataNormalizer 구현

**Files:**
- Create: `packages/core/src/excel/DataNormalizer.ts`

- [ ] **Step 1: 구현**

```typescript
// packages/core/src/excel/DataNormalizer.ts
import dayjs from 'dayjs';
import type { NormalizationError, NormalizedRow, StandardField } from './types';

export type ColumnMapping = Record<string, StandardField>;

const PHONE_RE = /^010\d{8}$/;
const DATE_FORMATS = [
  'YYYY-MM-DD', 'YYYY.MM.DD', 'YYYY/MM/DD',
  'YY-MM-DD', 'YY.MM.DD', 'YY/MM/DD',
  'YYYY-M-D', 'YYYY.M.D', 'YY.M.D',
];

function normalizePhone(raw: string): string | null {
  let digits = raw.replace(/\D+/g, '');
  if (digits.startsWith('82')) digits = '0' + digits.slice(2);
  return PHONE_RE.test(digits) ? digits : null;
}

function normalizeDate(raw: string): string | null {
  const trimmed = raw.trim();
  // M월 D일 형태
  const m = trimmed.match(/^(\d{4})?\D*?(\d{1,2})\s*월\s*(\d{1,2})\s*일$/);
  if (m) {
    const y = m[1] ?? String(new Date().getFullYear());
    const month = m[2].padStart(2, '0');
    const day = m[3].padStart(2, '0');
    return `${y.length === 2 ? '20' + y : y}-${month}-${day}`;
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
    const s = String(raw);

    let value: string | number | null = null;
    switch (stdField) {
      case 'phone':
      case 'parentPhone':
        value = normalizePhone(s); break;
      case 'birthDate':
      case 'enrollmentDate':
      case 'paymentDate':
        value = normalizeDate(s); break;
      case 'amount':
        value = normalizeAmount(s); break;
      case 'name':
        value = normalizeName(s); break;
      default:
        value = s.trim();
    }

    if (value === null || (typeof value === 'string' && value === '')) {
      errors.push({ field: stdField, rawValue: raw, message: `'${stdField}' 변환 실패: "${s}"` });
    } else {
      data[stdField] = value;
    }
  }

  return { data, errors };
}
```

- [ ] **Step 2: dayjs 커스텀 포맷 플러그인 활성화 필요**

`packages/core/src/excel/DataNormalizer.ts` 상단에:
```typescript
import customParseFormat from 'dayjs/plugin/customParseFormat';
dayjs.extend(customParseFormat);
```

(이미 dayjs 의존 있음. 플러그인은 dayjs 패키지에 포함.)

- [ ] **Step 3: 테스트 통과 확인**

```bash
pnpm --filter @tutomate/core test -- DataNormalizer
```

Expected: PASS.

- [ ] **Step 4: 커밋**

```bash
git add packages/core/src/excel/DataNormalizer.ts \
        packages/core/src/excel/__tests__/DataNormalizer.test.ts
git commit -m "feat(excel): DataNormalizer — 전화/날짜/금액/이름 룰 정규화"
```

---

### Task 1.6: 동의어 사전

**Files:**
- Create: `packages/core/src/mapping/synonyms.ts`
- Create: `packages/core/src/mapping/__tests__/synonyms.test.ts`

- [ ] **Step 1: 사전 작성**

```typescript
// packages/core/src/mapping/synonyms.ts
import type { StandardField } from '../excel/types';

export const SYNONYMS: Record<StandardField, string[]> = {
  name:           ['이름', '학생명', '성명', '원생명', '수강생명', '아이이름', '회원명', '교습생', 'name', 'student', 'member'],
  phone:          ['전화', '연락처', '핸드폰', '휴대폰', '전화번호', 'phone', 'tel', 'mobile'],
  parentPhone:    ['보호자', '학부모', '학부모연락처', '보호자전화', '엄마번호', '아빠번호'],
  birthDate:      ['생년월일', '생일', '생년', '출생일'],
  enrollmentDate: ['등록일', '등록일자', '입회일', '가입일', '시작일'],
  paymentDate:    ['납부일', '결제일', '입금일', '납입일', '수납일', '결제일자', '납부일자'],
  amount:         ['금액', '수강료', '납부액', '결제금액', '학원비', '원비', '수업료', '교습비', '강습료', '회비'],
  paymentMethod:  ['결제수단', '납부방법', '결제방법', '결제유형'],
  note:           ['비고', '메모', '특이사항', '참고'],
  className:      ['반', '수강반', '클래스', '강의명', '강좌명', '수업명'],
  tuitionPlan:    ['과정', '수강과정', '코스', '프로그램', '강좌'],
};

/** 헤더 정규화: 공백/괄호/특수문자 제거 + 소문자화 */
export function normalizeHeader(raw: string): string {
  return String(raw).toLowerCase().replace(/[\s()\[\]_\-./:]+/g, '');
}

/** 정규화된 헤더로 사전 검색. 정확/부분 일치 모두 허용. */
export function findField(normalizedHeader: string): StandardField | null {
  for (const [field, words] of Object.entries(SYNONYMS) as [StandardField, string[]][]) {
    for (const w of words) {
      const wn = normalizeHeader(w);
      if (normalizedHeader === wn) return field;
    }
  }
  for (const [field, words] of Object.entries(SYNONYMS) as [StandardField, string[]][]) {
    for (const w of words) {
      const wn = normalizeHeader(w);
      if (normalizedHeader.includes(wn) || wn.includes(normalizedHeader)) return field;
    }
  }
  return null;
}
```

- [ ] **Step 2: 테스트**

```typescript
// packages/core/src/mapping/__tests__/synonyms.test.ts
import { describe, it, expect } from 'vitest';
import { findField, normalizeHeader } from '../synonyms';

describe('synonyms', () => {
  it('정확 일치', () => {
    expect(findField(normalizeHeader('이름'))).toBe('name');
    expect(findField(normalizeHeader('연락처'))).toBe('phone');
    expect(findField(normalizeHeader('결제일'))).toBe('paymentDate');
  });
  it('부분 일치 (괄호/공백 변형)', () => {
    expect(findField(normalizeHeader('학생 이름'))).toBe('name');
    expect(findField(normalizeHeader('전화번호 (휴대)'))).toBe('phone');
  });
  it('없는 헤더 → null', () => {
    expect(findField(normalizeHeader('도시락여부'))).toBeNull();
  });
});
```

- [ ] **Step 3: 통과 확인 + 커밋**

```bash
pnpm --filter @tutomate/core test -- synonyms
git add packages/core/src/mapping/synonyms.ts packages/core/src/mapping/__tests__/synonyms.test.ts
git commit -m "feat(mapping): 동의어 사전 + findField 룰 매칭"
```

---

### Task 1.7: ColumnMapper + 캐시 store

**Files:**
- Create: `packages/core/src/mapping/mappingCacheStore.ts`
- Create: `packages/core/src/mapping/ColumnMapper.ts`
- Create: `packages/core/src/mapping/__tests__/ColumnMapper.test.ts`

- [ ] **Step 1: 캐시 시그니처 함수**

`packages/core/src/mapping/ColumnMapper.ts`:
```typescript
import type { StandardField } from '../excel/types';
import { findField, normalizeHeader } from './synonyms';

export interface MappingResult {
  status: 'ok' | 'mismatch';
  mapping: Record<string, StandardField>;
  unmatched: string[];
}

export function computeSignature(headers: string[]): string {
  const norm = headers.map(normalizeHeader).filter(Boolean).sort().join('|');
  // 환경 호환을 위해 단순 해시 (Node와 브라우저 모두 동작)
  let h = 5381;
  for (let i = 0; i < norm.length; i++) {
    h = ((h << 5) + h + norm.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

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
```

- [ ] **Step 2: 캐시 store (Supabase CRUD)**

`packages/core/src/mapping/mappingCacheStore.ts`:
```typescript
import { supabase } from '../lib/supabase';
import type { StandardField } from '../excel/types';

export async function loadCachedMapping(orgId: string, signature: string)
  : Promise<Record<string, StandardField> | null> {
  const { data, error } = await supabase
    .from('mapping_profiles')
    .select('mapping')
    .eq('org_id', orgId)
    .eq('signature', signature)
    .maybeSingle();
  if (error || !data) return null;
  return data.mapping as Record<string, StandardField>;
}

export async function saveMappingCache(
  orgId: string,
  signature: string,
  mapping: Record<string, StandardField>,
): Promise<void> {
  await supabase
    .from('mapping_profiles')
    .upsert({ org_id: orgId, signature, mapping }, { onConflict: 'org_id,signature' });
}
```

(`supabase` import 경로는 `packages/core/src/lib/supabase`. 기존 stores와 동일.)

- [ ] **Step 3: 테스트 (룰 매칭만 커버, supabase는 모킹)**

```typescript
// packages/core/src/mapping/__tests__/ColumnMapper.test.ts
import { describe, it, expect } from 'vitest';
import { tryRuleMapping, computeSignature } from '../ColumnMapper';

describe('tryRuleMapping', () => {
  it('전부 매칭되면 status=ok', () => {
    const r = tryRuleMapping(['이름', '연락처', '결제일', '금액']);
    expect(r.status).toBe('ok');
    expect(r.mapping).toEqual({
      '이름': 'name',
      '연락처': 'phone',
      '결제일': 'paymentDate',
      '금액': 'amount',
    });
  });
  it('매칭 안 되는 헤더 있으면 status=mismatch', () => {
    const r = tryRuleMapping(['이름', '도시락여부']);
    expect(r.status).toBe('mismatch');
    expect(r.unmatched).toEqual(['도시락여부']);
  });
});

describe('computeSignature', () => {
  it('헤더 순서가 달라도 동일 시그니처', () => {
    expect(computeSignature(['이름', '연락처'])).toBe(computeSignature(['연락처', '이름']));
  });
  it('헤더 집합이 다르면 시그니처 다름', () => {
    expect(computeSignature(['이름', '연락처']))
      .not.toBe(computeSignature(['이름', '주소']));
  });
});
```

- [ ] **Step 4: 통과 + 커밋**

```bash
pnpm --filter @tutomate/core test -- ColumnMapper
git add packages/core/src/mapping/ColumnMapper.ts packages/core/src/mapping/mappingCacheStore.ts \
        packages/core/src/mapping/__tests__/ColumnMapper.test.ts
git commit -m "feat(mapping): ColumnMapper + signature + supabase cache store"
```

---

### Task 1.8: core 모듈 re-export

**Files:**
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: re-export 추가**

```typescript
// 기존 export 유지 + 아래 추가
export * from './excel/types';
export * from './excel/ExcelParser';
export * from './excel/DataNormalizer';
export * from './mapping/synonyms';
export * from './mapping/ColumnMapper';
export * from './mapping/mappingCacheStore';
```

- [ ] **Step 2: 빌드 확인 + 커밋**

```bash
pnpm --filter @tutomate/core test
git add packages/core/src/index.ts
git commit -m "chore(core): export excel/mapping modules"
```

---

## Phase 2 — AI 인프라 (메인 프로세스)

### Task 2.1: HardwareDiagnostic — 실패 테스트

**Files:**
- Create: `packages/electron-shared/src/ai/__tests__/HardwareDiagnostic.test.ts`

- [ ] **Step 1: vitest 설정 확인 (electron-shared)**

`packages/electron-shared/package.json`의 scripts에 test 추가 필요시:
```json
"scripts": {
  "test": "vitest run"
}
```

(없으면 추가하고 vitest 의존을 dev에 추가)
```bash
pnpm --filter @tutomate/electron-shared add -D vitest@^4.1.0
```

- [ ] **Step 2: 테스트 작성**

```typescript
// packages/electron-shared/src/ai/__tests__/HardwareDiagnostic.test.ts
import { describe, it, expect } from 'vitest';
import { decideRecommendation } from '../HardwareDiagnostic';

describe('decideRecommendation', () => {
  it('16GB+ RAM, 5GB+ disk → ok (쾌적)', () => {
    expect(decideRecommendation({ ramGB: 16, diskGB: 10 })).toEqual({
      recommendation: 'ok', tier: 'fast',
    });
  });
  it('8GB RAM, 3GB disk → ok (느림 안내)', () => {
    expect(decideRecommendation({ ramGB: 8, diskGB: 3 })).toEqual({
      recommendation: 'ok', tier: 'slow',
    });
  });
  it('4~7GB RAM → warn', () => {
    expect(decideRecommendation({ ramGB: 5, diskGB: 4 }).recommendation).toBe('warn');
  });
  it('4GB 미만 또는 디스크 부족 → block', () => {
    expect(decideRecommendation({ ramGB: 3, diskGB: 4 }).recommendation).toBe('block');
    expect(decideRecommendation({ ramGB: 16, diskGB: 1 }).recommendation).toBe('block');
  });
});
```

---

### Task 2.2: HardwareDiagnostic 구현

**Files:**
- Create: `packages/electron-shared/src/ai/HardwareDiagnostic.ts`

- [ ] **Step 1: 구현**

```typescript
// packages/electron-shared/src/ai/HardwareDiagnostic.ts
import os from 'node:os';
import fs from 'node:fs';

export type Recommendation = 'ok' | 'warn' | 'block';
export type Tier = 'fast' | 'slow' | 'unsupported';

export interface DiagnosticInput { ramGB: number; diskGB: number; }
export interface DiagnosticResult {
  ramGB: number;
  diskGB: number;
  recommendation: Recommendation;
  tier: Tier;
}

export function decideRecommendation(input: DiagnosticInput): { recommendation: Recommendation; tier: Tier } {
  const { ramGB, diskGB } = input;
  if (ramGB < 4 || diskGB < 2) return { recommendation: 'block', tier: 'unsupported' };
  if (ramGB >= 16 && diskGB >= 5) return { recommendation: 'ok', tier: 'fast' };
  if (ramGB >= 8 && diskGB >= 3) return { recommendation: 'ok', tier: 'slow' };
  return { recommendation: 'warn', tier: 'slow' };
}

export async function diagnose(targetDir: string): Promise<DiagnosticResult> {
  const ramGB = os.totalmem() / (1024 ** 3);
  let diskGB = 0;
  try {
    // statfs는 Node 18+에서 사용 가능
    const stats = await fs.promises.statfs(targetDir);
    diskGB = (stats.bavail * stats.bsize) / (1024 ** 3);
  } catch {
    diskGB = 999; // 측정 실패 시 디스크 영향 배제
  }
  const decision = decideRecommendation({ ramGB, diskGB });
  return {
    ramGB: Math.round(ramGB * 10) / 10,
    diskGB: Math.round(diskGB * 10) / 10,
    ...decision,
  };
}
```

- [ ] **Step 2: 통과 + 커밋**

```bash
pnpm --filter @tutomate/electron-shared test -- HardwareDiagnostic
git add packages/electron-shared/src/ai/HardwareDiagnostic.ts \
        packages/electron-shared/src/ai/__tests__/HardwareDiagnostic.test.ts \
        packages/electron-shared/package.json
git commit -m "feat(ai): HardwareDiagnostic — RAM/disk 기반 추천 분기"
```

---

### Task 2.3: FileStash — 실패 테스트

**Files:**
- Create: `packages/electron-shared/src/ai/__tests__/FileStash.test.ts`

- [ ] **Step 1: 테스트**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { createFileStash } from '../FileStash';

const TMP = path.join(os.tmpdir(), 'tutomate-stash-test-' + Date.now());

beforeEach(() => {
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.mkdirSync(TMP, { recursive: true });
});

describe('FileStash', () => {
  it('save → fileId 반환, read 시 동일 buffer', async () => {
    const stash = createFileStash({ baseDir: TMP, ttlMs: 60_000 });
    const buf = Buffer.from('hello world');
    const { fileId } = await stash.save(buf);
    expect(fileId).toMatch(/^[0-9a-f-]{36}$/i);
    const read = await stash.read(fileId);
    expect(read.equals(buf)).toBe(true);
  });

  it('TTL 지난 파일은 read 시 에러', async () => {
    const stash = createFileStash({ baseDir: TMP, ttlMs: 1 });
    const { fileId } = await stash.save(Buffer.from('x'));
    await new Promise((r) => setTimeout(r, 10));
    await expect(stash.read(fileId)).rejects.toThrow(/만료|존재/);
  });
});
```

---

### Task 2.4: FileStash 구현

**Files:**
- Create: `packages/electron-shared/src/ai/FileStash.ts`

- [ ] **Step 1: 구현**

```typescript
// packages/electron-shared/src/ai/FileStash.ts
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export interface FileStashOptions {
  baseDir: string;
  ttlMs?: number;
}

export interface FileStash {
  save(buf: Buffer): Promise<{ fileId: string }>;
  read(fileId: string): Promise<Buffer>;
  delete(fileId: string): Promise<void>;
  cleanupExpired(): Promise<void>;
}

const META_SUFFIX = '.json';

export function createFileStash(opts: FileStashOptions): FileStash {
  const ttlMs = opts.ttlMs ?? 30 * 60_000;
  fs.mkdirSync(opts.baseDir, { recursive: true });

  function pathOf(fileId: string) {
    if (!/^[0-9a-f-]{36}$/i.test(fileId)) throw new Error('invalid fileId');
    return path.join(opts.baseDir, fileId);
  }

  return {
    async save(buf) {
      const fileId = randomUUID();
      const p = pathOf(fileId);
      await fs.promises.writeFile(p, buf);
      await fs.promises.writeFile(p + META_SUFFIX, JSON.stringify({ created: Date.now() }));
      return { fileId };
    },
    async read(fileId) {
      const p = pathOf(fileId);
      let metaRaw: string;
      try { metaRaw = await fs.promises.readFile(p + META_SUFFIX, 'utf-8'); }
      catch { throw new Error(`첨부 파일이 존재하지 않습니다: ${fileId}`); }
      const meta = JSON.parse(metaRaw) as { created: number };
      if (Date.now() - meta.created > ttlMs) {
        throw new Error(`첨부 파일이 만료되었습니다: ${fileId}`);
      }
      return fs.promises.readFile(p);
    },
    async delete(fileId) {
      const p = pathOf(fileId);
      await fs.promises.rm(p, { force: true });
      await fs.promises.rm(p + META_SUFFIX, { force: true });
    },
    async cleanupExpired() {
      const entries = await fs.promises.readdir(opts.baseDir);
      const now = Date.now();
      for (const e of entries) {
        if (!e.endsWith(META_SUFFIX)) continue;
        const metaPath = path.join(opts.baseDir, e);
        try {
          const meta = JSON.parse(await fs.promises.readFile(metaPath, 'utf-8')) as { created: number };
          if (now - meta.created > ttlMs) {
            const fileId = e.slice(0, -META_SUFFIX.length);
            await fs.promises.rm(path.join(opts.baseDir, fileId), { force: true });
            await fs.promises.rm(metaPath, { force: true });
          }
        } catch { /* skip */ }
      }
    },
  };
}
```

- [ ] **Step 2: 통과 + 커밋**

```bash
pnpm --filter @tutomate/electron-shared test -- FileStash
git add packages/electron-shared/src/ai/FileStash.ts \
        packages/electron-shared/src/ai/__tests__/FileStash.test.ts
git commit -m "feat(ai): FileStash — 첨부 파일 임시 저장 (TTL 30분)"
```

---

### Task 2.5: ModelManager — 다운로드/검증/로드 (인프라 스켈레톤)

**Files:**
- Create: `packages/electron-shared/src/ai/ModelManager.ts`

- [ ] **Step 1: 구현 (테스트는 Task 2.7에서 통합 검증)**

```typescript
// packages/electron-shared/src/ai/ModelManager.ts
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

export interface ModelSpec {
  id: string;
  filename: string;
  url: string;
  sha256: string;
  sizeBytes: number;
}

export const QWEN_2_5_3B_Q4: ModelSpec = {
  id: 'qwen-2.5-3b-instruct-q4',
  filename: 'qwen-2.5-3b-instruct-q4_k_m.gguf',
  url: 'https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf',
  sha256: 'TBD-FILL-AFTER-FIRST-DOWNLOAD',
  sizeBytes: 2_100_000_000, // 약 2GB
};

export type ModelEvent =
  | { type: 'progress'; received: number; total: number }
  | { type: 'verifying' }
  | { type: 'done' }
  | { type: 'error'; message: string };

export class ModelManager {
  constructor(private baseDir: string) {
    fs.mkdirSync(baseDir, { recursive: true });
  }

  modelPath(spec: ModelSpec): string {
    return path.join(this.baseDir, spec.filename);
  }

  isInstalled(spec: ModelSpec): boolean {
    return fs.existsSync(this.modelPath(spec));
  }

  async download(spec: ModelSpec, onEvent: (e: ModelEvent) => void, signal?: AbortSignal): Promise<void> {
    const dest = this.modelPath(spec);
    const tmp = dest + '.part';
    const startBytes = fs.existsSync(tmp) ? fs.statSync(tmp).size : 0;

    const headers: Record<string, string> = {};
    if (startBytes > 0) headers['Range'] = `bytes=${startBytes}-`;

    const res = await fetch(spec.url, { headers, signal });
    if (!res.ok && res.status !== 206) {
      onEvent({ type: 'error', message: `다운로드 실패: HTTP ${res.status}` });
      throw new Error(`HTTP ${res.status}`);
    }

    const totalHeader = res.headers.get('content-length');
    const total = totalHeader ? Number(totalHeader) + startBytes : spec.sizeBytes;
    const writer = fs.createWriteStream(tmp, { flags: startBytes > 0 ? 'a' : 'w' });

    let received = startBytes;
    const reader = res.body!;
    const stream = Readable.fromWeb(reader as never);
    stream.on('data', (chunk: Buffer) => {
      received += chunk.length;
      onEvent({ type: 'progress', received, total });
    });

    await pipeline(stream, writer);

    onEvent({ type: 'verifying' });
    if (spec.sha256 && spec.sha256 !== 'TBD-FILL-AFTER-FIRST-DOWNLOAD') {
      const hash = crypto.createHash('sha256');
      const verifyStream = fs.createReadStream(tmp);
      for await (const chunk of verifyStream) hash.update(chunk as Buffer);
      const got = hash.digest('hex');
      if (got !== spec.sha256) {
        await fs.promises.rm(tmp, { force: true });
        onEvent({ type: 'error', message: 'sha256 불일치 — 다시 시도해주세요' });
        throw new Error('sha256 mismatch');
      }
    }
    await fs.promises.rename(tmp, dest);
    onEvent({ type: 'done' });
  }

  async uninstall(spec: ModelSpec): Promise<void> {
    await fs.promises.rm(this.modelPath(spec), { force: true });
  }
}
```

- [ ] **Step 2: 커밋**

```bash
git add packages/electron-shared/src/ai/ModelManager.ts
git commit -m "feat(ai): ModelManager — Qwen GGUF 다운로드/재개/sha256 검증/삭제"
```

> 주: `spec.sha256` 값은 첫 다운로드 후 사용자가 측정·갱신. CI에서 검증.

---

### Task 2.6: LlamaRuntime 래퍼 + Tool/Message 타입

**Files:**
- Create: `packages/core/src/ai/types.ts`
- Create: `packages/electron-shared/src/ai/LlamaRuntime.ts`

- [ ] **Step 1: core 타입 정의 (Renderer + Main 공용)**

```typescript
// packages/core/src/ai/types.ts
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
  attachments?: { fileId: string; name: string }[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: object; // JSON Schema
}

export interface ToolCall {
  id: string;
  name: string;
  args: unknown;
}

export interface ChatStreamEvent {
  type: 'token' | 'tool_call' | 'tool_result' | 'card' | 'done' | 'error';
  token?: string;
  toolCall?: ToolCall;
  toolResult?: unknown;
  card?: SmartCard;
  message?: string;
}

export type SmartCard =
  | { type: 'mappingError'; matched: string[]; unmatched: string[] }
  | { type: 'importPreview'; fileId: string; mapping: Record<string, string>; rows: unknown[]; total: number; errorRows: number; kind: 'students' | 'payments' }
  | { type: 'importResult'; added: number; duplicated: number; errors: number }
  | { type: 'sourceLink'; kind: string; id: string; label: string };
```

- [ ] **Step 2: LlamaRuntime 래퍼**

```typescript
// packages/electron-shared/src/ai/LlamaRuntime.ts
import type { ChatMessage, ToolDefinition, ChatStreamEvent } from '@tutomate/core';

export interface LlamaRuntimeOptions {
  modelPath: string;
  contextSize?: number;
  threads?: number;
}

export interface LlamaRuntime {
  load(): Promise<void>;
  chat(messages: ChatMessage[], tools: ToolDefinition[], onEvent: (e: ChatStreamEvent) => void, signal?: AbortSignal): Promise<void>;
  unload(): Promise<void>;
}

export async function createLlamaRuntime(opts: LlamaRuntimeOptions): Promise<LlamaRuntime> {
  // dynamic import — node-llama-cpp는 네이티브 바이너리 의존
  const llama = await import('node-llama-cpp');
  let model: Awaited<ReturnType<typeof llama.getLlama>> extends infer L ? L : never;
  let context: any = null;
  let session: any = null;
  let llamaInst: any = null;

  return {
    async load() {
      llamaInst = await llama.getLlama();
      const m = await llamaInst.loadModel({ modelPath: opts.modelPath });
      model = m;
      context = await m.createContext({ contextSize: opts.contextSize ?? 4096 });
      const { LlamaChatSession } = llama;
      session = new LlamaChatSession({ contextSequence: context.getSequence() });
    },
    async chat(messages, tools, onEvent, signal) {
      if (!session) throw new Error('LlamaRuntime: load()를 먼저 호출하세요');
      const last = messages[messages.length - 1];
      const userText = last?.content ?? '';

      // Function-calling: node-llama-cpp의 functions 옵션 사용
      const functions: Record<string, any> = {};
      for (const t of tools) {
        functions[t.name] = {
          description: t.description,
          params: t.parameters,
          handler: async (args: unknown) => {
            // 메인 프로세스에서 실제 ActionDispatcher가 호출됨.
            // 여기서는 placeholder — 실제 호출은 Task 3.x에서 wire-up
            return { __pending__: true, args };
          },
        };
      }

      try {
        await session.prompt(userText, {
          functions,
          signal,
          onTextChunk: (chunk: string) => onEvent({ type: 'token', token: chunk }),
        });
        onEvent({ type: 'done' });
      } catch (e: any) {
        if (signal?.aborted) onEvent({ type: 'error', message: '취소됨' });
        else onEvent({ type: 'error', message: e?.message ?? String(e) });
      }
    },
    async unload() {
      try { await context?.dispose?.(); } catch {}
      try { await llamaInst?.dispose?.(); } catch {}
      session = null; context = null; model = null as never; llamaInst = null;
    },
  };
}
```

> 주: handler의 placeholder는 Task 3.5에서 ActionDispatcher와 연결.

- [ ] **Step 3: 빌드 + 커밋 (런타임 테스트는 통합 단계에서)**

```bash
pnpm -r build || true
git add packages/core/src/ai/types.ts packages/electron-shared/src/ai/LlamaRuntime.ts
git commit -m "feat(ai): LlamaRuntime 래퍼 + ChatMessage/ToolDefinition/SmartCard 타입"
```

---

### Task 2.7: AI 모듈 index + electron-shared export

**Files:**
- Create: `packages/electron-shared/src/ai/index.ts`
- Modify: `packages/electron-shared/src/index.ts` (없으면 신규)

- [ ] **Step 1: index 작성**

```typescript
// packages/electron-shared/src/ai/index.ts
export * from './HardwareDiagnostic';
export * from './FileStash';
export * from './ModelManager';
export * from './LlamaRuntime';
```

- [ ] **Step 2: 커밋**

```bash
git add packages/electron-shared/src/ai/index.ts
git commit -m "chore(electron-shared): export ai/* modules"
```

---

## Phase 3 — 도구 카탈로그 + ActionDispatcher

> 각 도구는 별도 파일로 분리(`packages/core/src/ai/tools/<name>.ts`). 각 도구는 `name`, `description`, `schema`(zod), `execute(args, ctx)`를 export. 본 계획에서는 일부는 골격, 일부는 풀 구현으로 작성.

### Task 3.1: Tool 인터페이스 정의 + ActionDispatcher 실패 테스트

**Files:**
- Modify: `packages/core/src/ai/types.ts` (Tool 인터페이스 추가)
- Create: `packages/core/src/ai/__tests__/ActionDispatcher.test.ts`

- [ ] **Step 1: Tool 인터페이스 추가**

`packages/core/src/ai/types.ts` 끝에 추가:
```typescript
import type { z } from 'zod';

export interface ToolContext {
  orgId: string;
  userId: string;
  fileStash?: { read(fileId: string): Promise<Buffer> };
  emit?: (card: SmartCard) => void;
}

export interface ToolHandler<S extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  description: string;
  schema: S;
  execute: (args: z.infer<S>, ctx: ToolContext) => Promise<unknown>;
}
```

- [ ] **Step 2: 테스트 작성**

```typescript
// packages/core/src/ai/__tests__/ActionDispatcher.test.ts
import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { createDispatcher } from '../ActionDispatcher';

const echoTool = {
  name: 'echo',
  description: 'echoes',
  schema: z.object({ text: z.string() }),
  execute: vi.fn(async (a) => ({ echoed: a.text })),
};

const ctx = { orgId: 'o1', userId: 'u1' };

describe('ActionDispatcher', () => {
  it('정상 인자 → execute 호출, 결과 반환', async () => {
    const d = createDispatcher([echoTool]);
    const r = await d.dispatch('echo', { text: 'hi' }, ctx);
    expect(r).toEqual({ echoed: 'hi' });
  });

  it('존재하지 않는 도구 → 에러 객체', async () => {
    const d = createDispatcher([echoTool]);
    const r = await d.dispatch('nope', {}, ctx);
    expect(r).toEqual({ error: { code: 'unknown_tool', message: expect.any(String) } });
  });

  it('zod 검증 실패 → 에러 객체', async () => {
    const d = createDispatcher([echoTool]);
    const r = await d.dispatch('echo', { text: 123 }, ctx);
    expect(r).toMatchObject({ error: { code: 'invalid_args' } });
  });
});
```

---

### Task 3.2: ActionDispatcher 구현

**Files:**
- Create: `packages/core/src/ai/ActionDispatcher.ts`

- [ ] **Step 1: 구현**

```typescript
// packages/core/src/ai/ActionDispatcher.ts
import type { ToolContext, ToolHandler } from './types';

export interface Dispatcher {
  dispatch(name: string, args: unknown, ctx: ToolContext): Promise<unknown>;
  list(): { name: string; description: string }[];
  schema(name: string): unknown | null;
}

export function createDispatcher(tools: ToolHandler[]): Dispatcher {
  const map = new Map<string, ToolHandler>();
  for (const t of tools) map.set(t.name, t);

  return {
    async dispatch(name, args, ctx) {
      const tool = map.get(name);
      if (!tool) {
        return { error: { code: 'unknown_tool', message: `존재하지 않는 도구: ${name}` } };
      }
      const parsed = tool.schema.safeParse(args);
      if (!parsed.success) {
        return { error: { code: 'invalid_args', message: parsed.error.message } };
      }
      try {
        return await tool.execute(parsed.data, ctx);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return { error: { code: 'execution_failed', message: msg } };
      }
    },
    list() {
      return Array.from(map.values()).map((t) => ({ name: t.name, description: t.description }));
    },
    schema(name) {
      return map.get(name)?.schema ?? null;
    },
  };
}
```

- [ ] **Step 2: 통과 + 커밋**

```bash
pnpm --filter @tutomate/core test -- ActionDispatcher
git add packages/core/src/ai/types.ts packages/core/src/ai/ActionDispatcher.ts \
        packages/core/src/ai/__tests__/ActionDispatcher.test.ts
git commit -m "feat(ai): ActionDispatcher — zod 검증 + 에러 봉투"
```

---

### Task 3.3: 조회 도구 10개 (Supabase 결정론적 검색)

**Files:**
- Create: `packages/core/src/ai/tools/searchStudent.ts`
- Create: `packages/core/src/ai/tools/getStudent.ts`
- Create: `packages/core/src/ai/tools/getPaymentHistory.ts`
- Create: `packages/core/src/ai/tools/getUnpaidStudents.ts`
- Create: `packages/core/src/ai/tools/getAttendance.ts`
- Create: `packages/core/src/ai/tools/getEnrollment.ts`
- Create: `packages/core/src/ai/tools/listClasses.ts`
- Create: `packages/core/src/ai/tools/getClassRoster.ts`
- Create: `packages/core/src/ai/tools/getMonthlySummary.ts`
- Create: `packages/core/src/ai/tools/getStudentSummary.ts`

- [ ] **Step 1: searchStudent 구현 (다른 도구의 패턴 표준)**

```typescript
// packages/core/src/ai/tools/searchStudent.ts
import { z } from 'zod';
import { supabase } from '../../lib/supabase';
import type { ToolHandler } from '../types';

const schema = z.object({
  name: z.string().optional(),
  phone: z.string().optional(),
}).refine((v) => v.name || v.phone, { message: 'name 또는 phone 중 하나는 필수' });

export const searchStudent: ToolHandler<typeof schema> = {
  name: 'searchStudent',
  description: '이름 또는 전화번호 부분 일치로 수강생을 검색합니다.',
  schema,
  async execute(args, ctx) {
    let q = supabase.from('students').select('id, name, phone').eq('org_id', ctx.orgId).limit(20);
    if (args.name) q = q.ilike('name', `%${args.name}%`);
    if (args.phone) q = q.ilike('phone', `%${args.phone.replace(/\D+/g, '')}%`);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return { students: data ?? [] };
  },
};
```

- [ ] **Step 2: getStudent**

```typescript
// packages/core/src/ai/tools/getStudent.ts
import { z } from 'zod';
import { supabase } from '../../lib/supabase';
import type { ToolHandler } from '../types';

const schema = z.object({ studentId: z.string() });

export const getStudent: ToolHandler<typeof schema> = {
  name: 'getStudent',
  description: '특정 수강생의 상세 정보',
  schema,
  async execute({ studentId }, ctx) {
    const { data, error } = await supabase
      .from('students')
      .select('*')
      .eq('id', studentId)
      .eq('org_id', ctx.orgId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return { error: { code: 'not_found', message: '수강생을 찾을 수 없습니다.' } };
    return { student: data };
  },
};
```

- [ ] **Step 3: getPaymentHistory**

```typescript
// packages/core/src/ai/tools/getPaymentHistory.ts
import { z } from 'zod';
import dayjs from 'dayjs';
import { supabase } from '../../lib/supabase';
import type { ToolHandler } from '../types';

const schema = z.object({
  studentId: z.string(),
  period: z.enum(['month', 'quarter', 'year']).optional(),
  limit: z.number().int().min(1).max(100).optional().default(20),
});

export const getPaymentHistory: ToolHandler<typeof schema> = {
  name: 'getPaymentHistory',
  description: '수강생의 결제 이력. period로 최근 기간 필터링 가능.',
  schema,
  async execute({ studentId, period, limit }, ctx) {
    let q = supabase.from('payment_records')
      .select('id, payment_date, amount, payment_method, note')
      .eq('student_id', studentId)
      .eq('org_id', ctx.orgId)
      .order('payment_date', { ascending: false })
      .limit(limit);

    if (period) {
      const since = dayjs().subtract(1, period).format('YYYY-MM-DD');
      q = q.gte('payment_date', since);
    }
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return { payments: data ?? [] };
  },
};
```

- [ ] **Step 4: getUnpaidStudents**

```typescript
// packages/core/src/ai/tools/getUnpaidStudents.ts
import { z } from 'zod';
import dayjs from 'dayjs';
import { supabase } from '../../lib/supabase';
import type { ToolHandler } from '../types';

const schema = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/).optional() });

export const getUnpaidStudents: ToolHandler<typeof schema> = {
  name: 'getUnpaidStudents',
  description: '특정 월(미지정 시 이번 달)의 미납자 목록',
  schema,
  async execute({ month }, ctx) {
    const target = month ?? dayjs().format('YYYY-MM');
    const { data, error } = await supabase
      .from('monthly_payments')
      .select('student_id, status, students!inner(id, name, phone)')
      .eq('org_id', ctx.orgId)
      .eq('month', target)
      .in('status', ['pending', 'partial']);
    if (error) throw new Error(error.message);
    return { month: target, unpaid: data ?? [] };
  },
};
```

- [ ] **Step 5: getAttendance**

```typescript
// packages/core/src/ai/tools/getAttendance.ts
import { z } from 'zod';
import { supabase } from '../../lib/supabase';
import type { ToolHandler } from '../types';

const schema = z.object({
  studentId: z.string(),
  period: z.string().regex(/^\d{4}-\d{2}$/).optional(),
});

export const getAttendance: ToolHandler<typeof schema> = {
  name: 'getAttendance',
  description: '수강생의 출석 기록 (period: YYYY-MM)',
  schema,
  async execute({ studentId, period }, ctx) {
    let q = supabase.from('attendance_records')
      .select('session_date, status')
      .eq('student_id', studentId)
      .eq('org_id', ctx.orgId)
      .order('session_date', { ascending: false })
      .limit(50);
    if (period) {
      q = q.gte('session_date', `${period}-01`).lte('session_date', `${period}-31`);
    }
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return { attendance: data ?? [] };
  },
};
```

- [ ] **Step 6: getEnrollment**

```typescript
// packages/core/src/ai/tools/getEnrollment.ts
import { z } from 'zod';
import { supabase } from '../../lib/supabase';
import type { ToolHandler } from '../types';

const schema = z.object({ studentId: z.string() });

export const getEnrollment: ToolHandler<typeof schema> = {
  name: 'getEnrollment',
  description: '수강생의 강좌 등록 정보',
  schema,
  async execute({ studentId }, ctx) {
    const { data, error } = await supabase
      .from('enrollments')
      .select('id, course_id, status, started_at, ended_at, courses!inner(id, name)')
      .eq('student_id', studentId)
      .eq('org_id', ctx.orgId);
    if (error) throw new Error(error.message);
    return { enrollments: data ?? [] };
  },
};
```

- [ ] **Step 7: listClasses + getClassRoster**

```typescript
// packages/core/src/ai/tools/listClasses.ts
import { z } from 'zod';
import { supabase } from '../../lib/supabase';
import type { ToolHandler } from '../types';

const schema = z.object({ studentId: z.string().optional() });

export const listClasses: ToolHandler<typeof schema> = {
  name: 'listClasses',
  description: '강좌 목록. studentId 지정 시 해당 수강생이 등록한 강좌만.',
  schema,
  async execute({ studentId }, ctx) {
    if (studentId) {
      const { data, error } = await supabase
        .from('enrollments')
        .select('courses!inner(id, name, instructor_name)')
        .eq('student_id', studentId)
        .eq('org_id', ctx.orgId);
      if (error) throw new Error(error.message);
      return { classes: (data ?? []).map((r: any) => r.courses) };
    }
    const { data, error } = await supabase
      .from('courses').select('id, name, instructor_name').eq('org_id', ctx.orgId);
    if (error) throw new Error(error.message);
    return { classes: data ?? [] };
  },
};
```

```typescript
// packages/core/src/ai/tools/getClassRoster.ts
import { z } from 'zod';
import { supabase } from '../../lib/supabase';
import type { ToolHandler } from '../types';

const schema = z.object({ classId: z.string() });

export const getClassRoster: ToolHandler<typeof schema> = {
  name: 'getClassRoster',
  description: '특정 강좌의 수강생 명단',
  schema,
  async execute({ classId }, ctx) {
    const { data, error } = await supabase
      .from('enrollments')
      .select('students!inner(id, name, phone)')
      .eq('course_id', classId)
      .eq('org_id', ctx.orgId);
    if (error) throw new Error(error.message);
    return { roster: (data ?? []).map((r: any) => r.students) };
  },
};
```

- [ ] **Step 8: getMonthlySummary + getStudentSummary**

```typescript
// packages/core/src/ai/tools/getMonthlySummary.ts
import { z } from 'zod';
import { supabase } from '../../lib/supabase';
import type { ToolHandler } from '../types';

const schema = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) });

export const getMonthlySummary: ToolHandler<typeof schema> = {
  name: 'getMonthlySummary',
  description: '해당 월의 매출/등록 요약 통계',
  schema,
  async execute({ month }, ctx) {
    const { data: pays } = await supabase
      .from('payment_records').select('amount')
      .eq('org_id', ctx.orgId)
      .gte('payment_date', `${month}-01`).lte('payment_date', `${month}-31`);
    const totalAmount = (pays ?? []).reduce((s, p: any) => s + (p.amount ?? 0), 0);

    const { count: newEnrollments } = await supabase
      .from('enrollments')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', ctx.orgId)
      .gte('started_at', `${month}-01`).lte('started_at', `${month}-31`);

    return { month, totalAmount, paymentCount: pays?.length ?? 0, newEnrollments: newEnrollments ?? 0 };
  },
};
```

```typescript
// packages/core/src/ai/tools/getStudentSummary.ts
import { z } from 'zod';
import { supabase } from '../../lib/supabase';
import type { ToolHandler } from '../types';

const schema = z.object({ studentId: z.string() });

export const getStudentSummary: ToolHandler<typeof schema> = {
  name: 'getStudentSummary',
  description: '수강생 종합 요약 (등록 강좌, 최근 결제, 출석률 등)',
  schema,
  async execute({ studentId }, ctx) {
    const [{ data: student }, { data: payments }, { data: enrolls }] = await Promise.all([
      supabase.from('students').select('*').eq('id', studentId).eq('org_id', ctx.orgId).maybeSingle(),
      supabase.from('payment_records').select('payment_date, amount').eq('student_id', studentId).order('payment_date', { ascending: false }).limit(5),
      supabase.from('enrollments').select('courses!inner(name), status').eq('student_id', studentId),
    ]);
    return { student, recentPayments: payments ?? [], enrollments: enrolls ?? [] };
  },
};
```

- [ ] **Step 9: 커밋**

```bash
git add packages/core/src/ai/tools/
git commit -m "feat(ai): 조회 도구 10개 (search/get/list/summary)"
```

> 주: 테이블/컬럼명은 기존 스키마 확인 후 조정. 일부 가정 (예: `monthly_payments`, `attendance_records`)은 실제 스키마와 다를 수 있으므로 `git grep "table_name"`으로 확인 후 조정 필요.

---

### Task 3.4: 임포트 도구 4개 (parseExcelHeaders / mapColumns / previewImport / confirmImport)

**Files:**
- Create: `packages/core/src/ai/tools/parseExcelHeaders.ts`
- Create: `packages/core/src/ai/tools/mapColumns.ts`
- Create: `packages/core/src/ai/tools/previewImport.ts`
- Create: `packages/core/src/ai/tools/confirmImport.ts`

- [ ] **Step 1: parseExcelHeaders**

```typescript
// packages/core/src/ai/tools/parseExcelHeaders.ts
import { z } from 'zod';
import { parseExcel } from '../../excel/ExcelParser';
import type { ToolHandler } from '../types';

const schema = z.object({ fileId: z.string() });

export const parseExcelHeaders: ToolHandler<typeof schema> = {
  name: 'parseExcelHeaders',
  description: '첨부된 엑셀의 헤더와 샘플 3행을 읽습니다.',
  schema,
  async execute({ fileId }, ctx) {
    if (!ctx.fileStash) throw new Error('FileStash 비활성');
    const buf = await ctx.fileStash.read(fileId);
    const parsed = parseExcel(new Uint8Array(buf));
    return {
      headers: parsed.headers,
      sample: parsed.rows.slice(0, 3),
      totalRows: parsed.rows.length,
    };
  },
};
```

- [ ] **Step 2: mapColumns**

```typescript
// packages/core/src/ai/tools/mapColumns.ts
import { z } from 'zod';
import { tryRuleMapping, computeSignature } from '../../mapping/ColumnMapper';
import { loadCachedMapping, saveMappingCache } from '../../mapping/mappingCacheStore';
import type { ToolHandler, SmartCard } from '../types';

const schema = z.object({
  headers: z.array(z.string()),
});

export const mapColumns: ToolHandler<typeof schema> = {
  name: 'mapColumns',
  description: '엑셀 헤더를 표준 필드로 매핑합니다. 캐시 우선, 룰 사전 폴백, 미매칭 컬럼 시 거부.',
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
```

- [ ] **Step 3: previewImport**

```typescript
// packages/core/src/ai/tools/previewImport.ts
import { z } from 'zod';
import { parseExcel } from '../../excel/ExcelParser';
import { normalizeRow } from '../../excel/DataNormalizer';
import type { ToolHandler, SmartCard } from '../types';
import type { StandardField } from '../../excel/types';

const schema = z.object({
  fileId: z.string(),
  mapping: z.record(z.string(), z.string()),
  kind: z.enum(['students', 'payments']),
});

export const previewImport: ToolHandler<typeof schema> = {
  name: 'previewImport',
  description: '매핑을 적용한 정규화 결과 미리보기 (최대 50행 + 통계). UI에 importPreview 카드를 띄웁니다.',
  schema,
  async execute({ fileId, mapping, kind }, ctx) {
    if (!ctx.fileStash) throw new Error('FileStash 비활성');
    const buf = await ctx.fileStash.read(fileId);
    const parsed = parseExcel(new Uint8Array(buf));
    const typed = mapping as Record<string, StandardField>;

    const previewRows = parsed.rows.slice(0, 50).map((r) => normalizeRow(r, typed));
    const errorRows = previewRows.filter((p) => p.errors.length > 0).length;

    const card: SmartCard = {
      type: 'importPreview',
      fileId, mapping, kind,
      rows: previewRows.map((p) => ({ data: p.data, errors: p.errors.map((e) => e.field) })),
      total: parsed.rows.length,
      errorRows,
    };
    ctx.emit?.(card);
    return { status: 'preview', total: parsed.rows.length, errorRows };
  },
};
```

- [ ] **Step 4: confirmImport**

```typescript
// packages/core/src/ai/tools/confirmImport.ts
import { z } from 'zod';
import { parseExcel } from '../../excel/ExcelParser';
import { normalizeRow } from '../../excel/DataNormalizer';
import { supabase } from '../../lib/supabase';
import type { ToolHandler, SmartCard } from '../types';
import type { StandardField } from '../../excel/types';

const schema = z.object({
  fileId: z.string(),
  mapping: z.record(z.string(), z.string()),
  kind: z.enum(['students', 'payments']),
});

export const confirmImport: ToolHandler<typeof schema> = {
  name: 'confirmImport',
  description: '미리보기 확정. Supabase에 학생/결제 일괄 UPSERT.',
  schema,
  async execute({ fileId, mapping, kind }, ctx) {
    if (!ctx.fileStash) throw new Error('FileStash 비활성');
    const buf = await ctx.fileStash.read(fileId);
    const parsed = parseExcel(new Uint8Array(buf));
    const typed = mapping as Record<string, StandardField>;

    const normalized = parsed.rows.map((r) => normalizeRow(r, typed));
    const valid = normalized.filter((n) => n.errors.length === 0);
    const errors = normalized.length - valid.length;

    let added = 0, duplicated = 0;

    if (kind === 'students') {
      const rows = valid.map((n) => ({
        org_id: ctx.orgId,
        name: n.data.name as string,
        phone: n.data.phone as string | undefined,
        birth_date: n.data.birthDate as string | undefined,
      })).filter((r) => r.name);
      const { data, error } = await supabase
        .from('students')
        .upsert(rows, { onConflict: 'org_id,phone', ignoreDuplicates: false })
        .select('id');
      if (error) throw new Error(error.message);
      added = data?.length ?? 0;
    } else {
      // payments: 학생 매칭 후 insert
      const phones = Array.from(new Set(valid.map((n) => n.data.phone).filter(Boolean))) as string[];
      const { data: students } = await supabase
        .from('students').select('id, phone').in('phone', phones).eq('org_id', ctx.orgId);
      const phoneToId = new Map((students ?? []).map((s: any) => [s.phone, s.id]));

      const rows = valid.map((n) => ({
        org_id: ctx.orgId,
        student_id: phoneToId.get(n.data.phone as string),
        payment_date: n.data.paymentDate,
        amount: n.data.amount,
        payment_method: n.data.paymentMethod ?? 'cash',
      })).filter((r) => r.student_id);

      duplicated = valid.length - rows.length; // 학생 매칭 실패 = 중복/누락
      const { data, error } = await supabase.from('payment_records').insert(rows).select('id');
      if (error) throw new Error(error.message);
      added = data?.length ?? 0;
    }

    const card: SmartCard = { type: 'importResult', added, duplicated, errors };
    ctx.emit?.(card);
    return { status: 'done', added, duplicated, errors };
  },
};
```

- [ ] **Step 5: 임포트 도구 통합 테스트**

```typescript
// packages/core/src/ai/__tests__/tools/importTools.test.ts
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

const ctx = {
  orgId: 'o1', userId: 'u1',
  fileStash: { read: async () => buildBuffer() },
  emit: vi.fn(),
};

describe('parseExcelHeaders', () => {
  it('헤더 + 샘플 + totalRows 반환', async () => {
    const r = await parseExcelHeaders.execute({ fileId: 'x' }, ctx) as any;
    expect(r.headers).toEqual(['이름', '연락처', '결제일', '금액']);
    expect(r.sample).toHaveLength(1);
    expect(r.totalRows).toBe(1);
  });
});

describe('mapColumns', () => {
  it('전부 매칭 → status=ok', async () => {
    const r = await mapColumns.execute({ headers: ['이름', '연락처', '결제일', '금액'] }, ctx) as any;
    expect(r.status).toBe('ok');
  });
  it('일부 미매칭 → status=mismatch + emit', async () => {
    ctx.emit = vi.fn();
    const r = await mapColumns.execute({ headers: ['이름', '도시락여부'] }, ctx) as any;
    expect(r.status).toBe('mismatch');
    expect(ctx.emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'mappingError' }));
  });
});
```

- [ ] **Step 6: 통과 + 커밋**

```bash
pnpm --filter @tutomate/core test -- importTools
git add packages/core/src/ai/tools/parseExcelHeaders.ts packages/core/src/ai/tools/mapColumns.ts \
        packages/core/src/ai/tools/previewImport.ts packages/core/src/ai/tools/confirmImport.ts \
        packages/core/src/ai/__tests__/tools/importTools.test.ts
git commit -m "feat(ai): 임포트 도구 4개 (parse/map/preview/confirm) + smart card emit"
```

---

### Task 3.5: ToolCatalog (모음 + index)

**Files:**
- Create: `packages/core/src/ai/ToolCatalog.ts`
- Create: `packages/core/src/ai/index.ts`

- [ ] **Step 1: ToolCatalog**

```typescript
// packages/core/src/ai/ToolCatalog.ts
import { searchStudent } from './tools/searchStudent';
import { getStudent } from './tools/getStudent';
import { getPaymentHistory } from './tools/getPaymentHistory';
import { getUnpaidStudents } from './tools/getUnpaidStudents';
import { getAttendance } from './tools/getAttendance';
import { getEnrollment } from './tools/getEnrollment';
import { listClasses } from './tools/listClasses';
import { getClassRoster } from './tools/getClassRoster';
import { getMonthlySummary } from './tools/getMonthlySummary';
import { getStudentSummary } from './tools/getStudentSummary';
import { parseExcelHeaders } from './tools/parseExcelHeaders';
import { mapColumns } from './tools/mapColumns';
import { previewImport } from './tools/previewImport';
import { confirmImport } from './tools/confirmImport';
import type { ToolHandler } from './types';

export const ALL_TOOLS: ToolHandler[] = [
  searchStudent, getStudent, getPaymentHistory, getUnpaidStudents,
  getAttendance, getEnrollment, listClasses, getClassRoster,
  getMonthlySummary, getStudentSummary,
  parseExcelHeaders, mapColumns, previewImport, confirmImport,
];

import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ToolDefinition } from './types';

export function toToolDefinitions(tools: ToolHandler[]): ToolDefinition[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: zodToJsonSchema(t.schema, { target: 'jsonSchema7' }),
  }));
}
```

- [ ] **Step 2: zod-to-json-schema 의존 추가**

```bash
pnpm --filter @tutomate/core add zod-to-json-schema@^3.22.0
```

- [ ] **Step 3: index**

```typescript
// packages/core/src/ai/index.ts
export * from './types';
export * from './ActionDispatcher';
export * from './ToolCatalog';
```

- [ ] **Step 4: core re-export**

`packages/core/src/index.ts` 끝에:
```typescript
export * from './ai';
```

- [ ] **Step 5: 빌드 + 커밋**

```bash
pnpm --filter @tutomate/core test
git add packages/core/src/ai/ToolCatalog.ts packages/core/src/ai/index.ts \
        packages/core/src/index.ts packages/core/package.json pnpm-lock.yaml
git commit -m "feat(ai): ToolCatalog — 14개 도구 + zod→JSONSchema 변환"
```

---

## Phase 4 — IPC + UI

### Task 4.1: IPC 핸들러 — file-stash:save

**Files:**
- Create: `apps/tutomate/electron/ipc/fileStashHandler.ts`
- Modify: `packages/electron-shared/src/preload.ts`

- [ ] **Step 1: 핸들러**

```typescript
// apps/tutomate/electron/ipc/fileStashHandler.ts
import { app, type IpcMain } from 'electron';
import path from 'node:path';
import { createFileStash } from '@tutomate/electron-shared';

const stashDir = path.join(app.getPath('userData'), '.stash');
export const fileStash = createFileStash({ baseDir: stashDir });

export function registerFileStashHandlers(ipcMain: IpcMain) {
  ipcMain.handle('file-stash:save', async (_e, name: string, buffer: ArrayBuffer) => {
    const { fileId } = await fileStash.save(Buffer.from(buffer));
    return { fileId, name };
  });
  ipcMain.handle('file-stash:delete', async (_e, fileId: string) => {
    await fileStash.delete(fileId);
  });
  // 시작 시 만료 청소
  setTimeout(() => fileStash.cleanupExpired(), 5000);
}
```

- [ ] **Step 2: preload 추가**

`packages/electron-shared/src/preload.ts`의 `electronAPI` 객체에:
```typescript
  // FileStash
  fileStashSave: (name: string, buffer: ArrayBuffer) =>
    ipcRenderer.invoke('file-stash:save', name, buffer),
  fileStashDelete: (fileId: string) =>
    ipcRenderer.invoke('file-stash:delete', fileId),
```

- [ ] **Step 3: 타입 추가**

`packages/core/src/types/electron.d.ts`의 `electronAPI` interface에:
```typescript
  fileStashSave: (name: string, buffer: ArrayBuffer) => Promise<{ fileId: string; name: string }>;
  fileStashDelete: (fileId: string) => Promise<void>;
```

- [ ] **Step 4: 커밋**

```bash
git add apps/tutomate/electron/ipc/fileStashHandler.ts \
        packages/electron-shared/src/preload.ts \
        packages/core/src/types/electron.d.ts
git commit -m "feat(ipc): file-stash:save/delete 핸들러 + preload 노출"
```

---

### Task 4.2: IPC 핸들러 — ai:status / diagnose / download / chat / cancel

**Files:**
- Create: `apps/tutomate/electron/ipc/aiHandler.ts`
- Modify: `packages/electron-shared/src/preload.ts`
- Modify: `packages/core/src/types/electron.d.ts`

- [ ] **Step 1: aiHandler 작성**

```typescript
// apps/tutomate/electron/ipc/aiHandler.ts
import { app, type IpcMain, BrowserWindow } from 'electron';
import path from 'node:path';
import {
  ModelManager, QWEN_2_5_3B_Q4, diagnose,
  createLlamaRuntime, type LlamaRuntime,
} from '@tutomate/electron-shared';
import {
  ALL_TOOLS, createDispatcher, toToolDefinitions,
  type ChatMessage, type SmartCard,
} from '@tutomate/core';
import { fileStash } from './fileStashHandler';

const aiDir = path.join(app.getPath('userData'), 'AI');
const manager = new ModelManager(aiDir);
let runtime: LlamaRuntime | null = null;
let abort: AbortController | null = null;

const dispatcher = createDispatcher(ALL_TOOLS);
const toolDefs = toToolDefinitions(ALL_TOOLS);

export function registerAiHandlers(ipcMain: IpcMain) {
  ipcMain.handle('ai:status', () => {
    if (!manager.isInstalled(QWEN_2_5_3B_Q4)) return 'not_installed';
    return runtime ? 'ready' : 'loading_pending';
  });

  ipcMain.handle('ai:diagnose', async () => diagnose(aiDir));

  ipcMain.handle('ai:download', async (event) => {
    const sender = event.sender;
    abort = new AbortController();
    try {
      await manager.download(QWEN_2_5_3B_Q4, (e) => {
        sender.send('ai:download-event', e);
      }, abort.signal);
    } finally {
      abort = null;
    }
  });

  ipcMain.handle('ai:cancel', () => abort?.abort());

  ipcMain.handle('ai:uninstall', async () => {
    if (runtime) { await runtime.unload(); runtime = null; }
    await manager.uninstall(QWEN_2_5_3B_Q4);
  });

  ipcMain.handle('ai:chat', async (event, payload: {
    messages: ChatMessage[];
    orgId: string;
    userId: string;
  }) => {
    const sender = event.sender;
    if (!runtime) {
      runtime = await createLlamaRuntime({
        modelPath: manager.modelPath(QWEN_2_5_3B_Q4),
      });
      await runtime.load();
    }
    abort = new AbortController();

    // 도구 실행은 ActionDispatcher 통해 메인 프로세스에서 직접 실행하고
    // 결과 카드는 ai:chat-event로 push
    const ctx = {
      orgId: payload.orgId, userId: payload.userId,
      fileStash,
      emit: (card: SmartCard) => sender.send('ai:chat-event', { type: 'card', card }),
    };

    // LlamaRuntime의 tool handler에서 dispatcher를 호출하도록 wrap
    // (주: LlamaRuntime의 functions handler를 dispatcher 호출로 교체)
    await runtime.chat(payload.messages, toolDefs, async (e) => {
      sender.send('ai:chat-event', e);
      if (e.type === 'tool_call' && e.toolCall) {
        const result = await dispatcher.dispatch(e.toolCall.name, e.toolCall.args, ctx);
        sender.send('ai:chat-event', { type: 'tool_result', toolResult: result });
      }
    }, abort.signal);

    abort = null;
  });
}
```

> 주: LlamaRuntime이 `tool_call` 이벤트를 발화하고 결과를 받아 다음 토큰에 활용하도록 한 작은 어댑터 변경이 필요. 현재 골격은 단순화. 통합 시 tool result loopback 구현 보강.

- [ ] **Step 2: preload + 타입 추가**

`preload.ts`:
```typescript
  aiStatus: () => ipcRenderer.invoke('ai:status'),
  aiDiagnose: () => ipcRenderer.invoke('ai:diagnose'),
  aiDownload: () => ipcRenderer.invoke('ai:download'),
  aiCancel: () => ipcRenderer.invoke('ai:cancel'),
  aiUninstall: () => ipcRenderer.invoke('ai:uninstall'),
  aiChat: (payload: any) => ipcRenderer.invoke('ai:chat', payload),
  onAiDownloadEvent: (cb: (e: any) => void) => {
    const h = (_: any, e: any) => cb(e);
    ipcRenderer.on('ai:download-event', h);
    return () => ipcRenderer.removeListener('ai:download-event', h);
  },
  onAiChatEvent: (cb: (e: any) => void) => {
    const h = (_: any, e: any) => cb(e);
    ipcRenderer.on('ai:chat-event', h);
    return () => ipcRenderer.removeListener('ai:chat-event', h);
  },
```

`electron.d.ts`에도 시그니처 추가.

- [ ] **Step 3: main.ts에 핸들러 등록**

`apps/tutomate/electron/main.ts` (없으면 신규)에 IPC 등록 코드:
```typescript
import { registerFileStashHandlers } from './ipc/fileStashHandler';
import { registerAiHandlers } from './ipc/aiHandler';
// app.whenReady() 안에서:
registerFileStashHandlers(ipcMain);
registerAiHandlers(ipcMain);
```

(`apps/tutomate-q/electron/`에도 동일 적용)

- [ ] **Step 4: 커밋**

```bash
git add apps/tutomate/electron/ipc/aiHandler.ts apps/tutomate/electron/main.ts \
        apps/tutomate-q/electron/ipc/aiHandler.ts apps/tutomate-q/electron/main.ts \
        packages/electron-shared/src/preload.ts packages/core/src/types/electron.d.ts
git commit -m "feat(ipc): ai 채널(status/diagnose/download/chat/cancel) + tool_call dispatch"
```

---

### Task 4.3: AI 챗봇 페이지 스켈레톤 + 라우트

**Files:**
- Create: `apps/tutomate/src/pages/ai-chat/AiChatPage.tsx`
- Modify: `apps/tutomate/src/App.tsx`
- (Q 버전 동일 적용)

- [ ] **Step 1: 페이지 골격**

```tsx
// apps/tutomate/src/pages/ai-chat/AiChatPage.tsx
import { useEffect, useState } from 'react';
import { ChatWindow } from './components/ChatWindow';
import { ChatInput } from './components/ChatInput';
import { ModelDownloadModal } from './components/ModelDownloadModal';
import { DirectImportFallback } from './components/DirectImportFallback';
import type { ChatMessage, SmartCard } from '@tutomate/core';

type AiState = 'not_installed' | 'loading_pending' | 'ready' | 'disabled';

export default function AiChatPage() {
  const [state, setState] = useState<AiState>('loading_pending');
  const [messages, setMessages] = useState<(ChatMessage & { cards?: SmartCard[] })[]>([]);

  useEffect(() => {
    window.electronAPI.aiStatus().then((s) => setState(s as AiState));
  }, []);

  if (state === 'not_installed') {
    return <ModelDownloadModal onInstalled={() => setState('ready')} onSkip={() => setState('disabled')} />;
  }
  if (state === 'disabled') {
    return <DirectImportFallback />;
  }

  return (
    <div className="flex flex-col h-full">
      <ChatWindow messages={messages} />
      <ChatInput
        onSend={async (text, attachment) => {
          const newMsg: ChatMessage = {
            role: 'user',
            content: text,
            attachments: attachment ? [{ fileId: attachment.fileId, name: attachment.name }] : undefined,
          };
          setMessages((m) => [...m, newMsg]);
          // ai:chat 호출 + 이벤트 핸들링은 Task 4.7
        }}
      />
    </div>
  );
}
```

- [ ] **Step 2: 라우트 추가**

`apps/tutomate/src/App.tsx`에서 라우터 부분에 `/ai-chat` 추가:
```tsx
import AiChatPage from './pages/ai-chat/AiChatPage';
// routes에:
{ path: '/ai-chat', element: <AiChatPage /> }
```

- [ ] **Step 3: 메뉴/네비게이션 항목 추가**

기존 사이드바 메뉴 컴포넌트(예: `apps/tutomate/src/components/Sidebar.tsx`)에 "AI 어시스턴트" 항목 추가 (큰 글씨, 아이콘).

- [ ] **Step 4: 커밋**

```bash
git add apps/tutomate/src/pages/ai-chat/AiChatPage.tsx apps/tutomate/src/App.tsx \
        apps/tutomate/src/components/Sidebar.tsx \
        apps/tutomate-q/src/pages/ai-chat/AiChatPage.tsx apps/tutomate-q/src/App.tsx \
        apps/tutomate-q/src/components/Sidebar.tsx
git commit -m "feat(ui): AI 챗봇 페이지 스켈레톤 + /ai-chat 라우트"
```

---

### Task 4.4: ChatWindow + MessageBubble + 스마트 카드 4종

**Files:**
- Create: `apps/tutomate/src/pages/ai-chat/components/ChatWindow.tsx`
- Create: `apps/tutomate/src/pages/ai-chat/components/MessageBubble.tsx`
- Create: `apps/tutomate/src/pages/ai-chat/components/SmartCard/MappingErrorCard.tsx`
- Create: `apps/tutomate/src/pages/ai-chat/components/SmartCard/ImportPreviewCard.tsx`
- Create: `apps/tutomate/src/pages/ai-chat/components/SmartCard/ImportResultCard.tsx`
- Create: `apps/tutomate/src/pages/ai-chat/components/SmartCard/SourceLinkCard.tsx`

- [ ] **Step 1: ChatWindow**

```tsx
import type { ChatMessage, SmartCard } from '@tutomate/core';
import { MessageBubble } from './MessageBubble';

export function ChatWindow({ messages }: { messages: (ChatMessage & { cards?: SmartCard[] })[] }) {
  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-3">
      {messages.map((m, i) => <MessageBubble key={i} message={m} />)}
    </div>
  );
}
```

- [ ] **Step 2: MessageBubble + 카드 라우팅**

```tsx
import type { ChatMessage, SmartCard } from '@tutomate/core';
import { MappingErrorCard } from './SmartCard/MappingErrorCard';
import { ImportPreviewCard } from './SmartCard/ImportPreviewCard';
import { ImportResultCard } from './SmartCard/ImportResultCard';
import { SourceLinkCard } from './SmartCard/SourceLinkCard';

function renderCard(c: SmartCard) {
  switch (c.type) {
    case 'mappingError':   return <MappingErrorCard {...c} />;
    case 'importPreview':  return <ImportPreviewCard {...c} />;
    case 'importResult':   return <ImportResultCard {...c} />;
    case 'sourceLink':     return <SourceLinkCard {...c} />;
  }
}

export function MessageBubble({ message }: { message: ChatMessage & { cards?: SmartCard[] } }) {
  const isUser = message.role === 'user';
  return (
    <div className={`max-w-2xl ${isUser ? 'ml-auto' : ''}`}>
      <div className={`rounded-2xl px-5 py-3 text-lg ${isUser ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}>
        {message.content}
      </div>
      {message.attachments?.map((a, i) => (
        <div key={i} className="text-sm text-gray-500 mt-1">📎 {a.name}</div>
      ))}
      {message.cards?.map((c, i) => <div key={i} className="mt-2">{renderCard(c)}</div>)}
    </div>
  );
}
```

- [ ] **Step 3: MappingErrorCard**

```tsx
import type { SmartCard } from '@tutomate/core';

type Props = Extract<SmartCard, { type: 'mappingError' }>;

export function MappingErrorCard({ matched, unmatched }: Props) {
  return (
    <div className="border-2 border-amber-300 bg-amber-50 rounded-2xl p-4">
      <div className="font-bold text-lg mb-2">엑셀 컬럼 일부를 인식하지 못했어요</div>
      <div className="text-base mb-1">✓ 인식: {matched.join(', ')}</div>
      <div className="text-base text-red-700 mb-3">✗ 인식 안 됨: {unmatched.join(', ')}</div>
      <a href="/templates/tutomate-import-template.xlsx" download
         className="inline-block bg-amber-600 text-white px-5 py-2 rounded-xl text-base">
        표준 양식 다운로드
      </a>
    </div>
  );
}
```

- [ ] **Step 4: ImportPreviewCard (확정/취소 버튼)**

```tsx
import { useState } from 'react';
import type { SmartCard } from '@tutomate/core';

type Props = Extract<SmartCard, { type: 'importPreview' }> & {
  onConfirm: () => void;
  onCancel: () => void;
};

export function ImportPreviewCard({ rows, total, errorRows, onConfirm, onCancel }: Props) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="border-2 border-blue-300 bg-blue-50 rounded-2xl p-4">
      <div className="font-bold text-lg mb-2">미리보기 ({total}행 중 5행)</div>
      {errorRows > 0 && (
        <div className="text-red-700 mb-2">⚠ {errorRows}개 행에 오류가 있어 제외됩니다</div>
      )}
      <table className="w-full text-sm mb-3">
        <tbody>
          {rows.slice(0, 5).map((r: any, i) => (
            <tr key={i} className={r.errors?.length ? 'bg-red-100' : ''}>
              <td className="p-1">{JSON.stringify(r.data)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex gap-3">
        <button disabled={busy} onClick={() => { setBusy(true); onConfirm(); }}
                className="bg-blue-600 text-white px-6 py-3 rounded-xl text-lg">
          {busy ? '처리 중…' : '확정'}
        </button>
        <button disabled={busy} onClick={onCancel}
                className="bg-gray-200 px-6 py-3 rounded-xl text-lg">취소</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: ImportResultCard / SourceLinkCard**

```tsx
// ImportResultCard.tsx
import type { SmartCard } from '@tutomate/core';
type Props = Extract<SmartCard, { type: 'importResult' }>;
export function ImportResultCard({ added, duplicated, errors }: Props) {
  return (
    <div className="border-2 border-green-300 bg-green-50 rounded-2xl p-4">
      <div className="font-bold text-lg mb-1">완료</div>
      <div>추가: {added}건 / 중복: {duplicated}건 / 오류: {errors}건</div>
    </div>
  );
}
```

```tsx
// SourceLinkCard.tsx
import { Link } from 'react-router-dom';
import type { SmartCard } from '@tutomate/core';
type Props = Extract<SmartCard, { type: 'sourceLink' }>;
export function SourceLinkCard({ kind, id, label }: Props) {
  return (
    <Link to={`/${kind}/${id}`} className="text-blue-600 underline text-base">{label} →</Link>
  );
}
```

- [ ] **Step 6: 커밋**

```bash
git add apps/tutomate/src/pages/ai-chat/components/ apps/tutomate-q/src/pages/ai-chat/components/
git commit -m "feat(ui): ChatWindow + MessageBubble + 스마트 카드 4종"
```

---

### Task 4.5: ChatInput (텍스트 + 파일 첨부)

**Files:**
- Create: `apps/tutomate/src/pages/ai-chat/components/ChatInput.tsx`

- [ ] **Step 1: 구현**

```tsx
import { useState, useRef } from 'react';

export function ChatInput({
  onSend,
}: {
  onSend: (text: string, attachment?: { fileId: string; name: string }) => void;
}) {
  const [text, setText] = useState('');
  const [attachment, setAttachment] = useState<{ fileId: string; name: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function pickFile(file: File) {
    const buf = await file.arrayBuffer();
    const r = await window.electronAPI.fileStashSave(file.name, buf);
    setAttachment(r);
  }

  return (
    <div className="border-t p-3 flex flex-col gap-2 bg-white">
      {attachment && (
        <div className="text-sm flex items-center gap-2">
          📎 {attachment.name}
          <button onClick={() => { window.electronAPI.fileStashDelete(attachment.fileId); setAttachment(null); }}
                  className="text-red-600">×</button>
        </div>
      )}
      <div className="flex gap-2">
        <button onClick={() => fileRef.current?.click()}
                className="px-4 py-3 bg-gray-100 rounded-xl text-lg">📎</button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" hidden
               onChange={(e) => e.target.files?.[0] && pickFile(e.target.files[0])} />
        <input value={text} onChange={(e) => setText(e.target.value)}
               placeholder="질문하거나 엑셀을 첨부하세요"
               className="flex-1 border rounded-xl px-4 py-3 text-lg" />
        <button onClick={() => {
          if (!text.trim() && !attachment) return;
          onSend(text, attachment ?? undefined);
          setText(''); setAttachment(null);
        }} className="bg-blue-600 text-white px-6 py-3 rounded-xl text-lg">
          보내기
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 커밋**

```bash
git add apps/tutomate/src/pages/ai-chat/components/ChatInput.tsx \
        apps/tutomate-q/src/pages/ai-chat/components/ChatInput.tsx
git commit -m "feat(ui): ChatInput — 텍스트 + 엑셀 첨부 (FileStash 연동)"
```

---

### Task 4.6: ModelDownloadModal + HardwareDiagnosticView + DirectImportFallback

**Files:**
- Create: `apps/tutomate/src/pages/ai-chat/components/ModelDownloadModal.tsx`
- Create: `apps/tutomate/src/pages/ai-chat/components/HardwareDiagnosticView.tsx`
- Create: `apps/tutomate/src/pages/ai-chat/components/DirectImportFallback.tsx`

- [ ] **Step 1: HardwareDiagnosticView**

```tsx
import { useEffect, useState } from 'react';

export function HardwareDiagnosticView() {
  const [d, setD] = useState<any>(null);
  useEffect(() => { window.electronAPI.aiDiagnose().then(setD); }, []);
  if (!d) return <div>진단 중…</div>;

  const msg =
    d.recommendation === 'ok' && d.tier === 'fast' ? '쾌적하게 사용 가능합니다.'
    : d.recommendation === 'ok' && d.tier === 'slow' ? '응답이 10~20초 걸릴 수 있어요.'
    : d.recommendation === 'warn' ? '성능이 낮거나 매우 느릴 수 있습니다.'
    : 'AI 챗봇을 사용할 수 없는 사양입니다. 직접 임포트만 가능합니다.';

  return (
    <div className="p-4 bg-gray-50 rounded-xl">
      <div className="text-base">RAM: {d.ramGB}GB · 디스크 여유: {d.diskGB}GB</div>
      <div className="text-base mt-1">{msg}</div>
    </div>
  );
}
```

- [ ] **Step 2: ModelDownloadModal**

```tsx
import { useEffect, useState } from 'react';
import { HardwareDiagnosticView } from './HardwareDiagnosticView';

export function ModelDownloadModal({
  onInstalled, onSkip,
}: { onInstalled: () => void; onSkip: () => void }) {
  const [progress, setProgress] = useState<{ received: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return window.electronAPI.onAiDownloadEvent((e: any) => {
      if (e.type === 'progress') setProgress({ received: e.received, total: e.total });
      else if (e.type === 'error') setError(e.message);
      else if (e.type === 'done') onInstalled();
    });
  }, [onInstalled]);

  const pct = progress ? Math.round((progress.received / progress.total) * 100) : 0;

  return (
    <div className="max-w-xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-bold">AI 어시스턴트 준비</h1>
      <p className="text-lg">AI 모델 약 2GB를 한 번 다운로드하면 인터넷 없이 사용할 수 있어요.</p>
      <HardwareDiagnosticView />

      {progress && (
        <div>
          <div className="bg-gray-200 rounded-full h-3">
            <div className="bg-blue-600 h-3 rounded-full" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-1 text-base">{pct}% ({(progress.received / 1e9).toFixed(2)}GB)</div>
        </div>
      )}
      {error && <div className="text-red-700">{error}</div>}

      <div className="flex gap-3">
        <button onClick={() => window.electronAPI.aiDownload()}
                className="bg-blue-600 text-white px-6 py-3 rounded-xl text-lg">지금 받기</button>
        <button onClick={onSkip} className="bg-gray-200 px-6 py-3 rounded-xl text-lg">나중에</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: DirectImportFallback**

```tsx
import { useState } from 'react';
import { ImportPreviewCard } from './SmartCard/ImportPreviewCard';
import { ImportResultCard } from './SmartCard/ImportResultCard';
import { MappingErrorCard } from './SmartCard/MappingErrorCard';
import type { SmartCard } from '@tutomate/core';

export function DirectImportFallback() {
  const [card, setCard] = useState<SmartCard | null>(null);

  async function handleFile(file: File) {
    const buf = await file.arrayBuffer();
    const { fileId } = await window.electronAPI.fileStashSave(file.name, buf);
    // 직접 도구 호출 IPC (별도 추가 필요): direct-import:run
    const result = await (window.electronAPI as any).directImportRun(fileId);
    setCard(result.card);
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">엑셀 직접 임포트</h1>
      <p className="text-lg mb-4">AI 어시스턴트를 사용할 수 없는 PC라 엑셀을 직접 임포트합니다.</p>
      <input type="file" accept=".xlsx,.xls" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
      {card?.type === 'mappingError' && <MappingErrorCard {...card} />}
      {card?.type === 'importPreview' && <ImportPreviewCard {...card} onConfirm={() => {}} onCancel={() => {}} />}
      {card?.type === 'importResult' && <ImportResultCard {...card} />}
    </div>
  );
}
```

- [ ] **Step 4: direct-import:run IPC 추가**

`apps/tutomate/electron/ipc/aiHandler.ts`에 추가:
```typescript
ipcMain.handle('direct-import:run', async (event, fileId: string) => {
  const ctx = {
    orgId: '...', // current org from auth
    userId: '...',
    fileStash,
    emit: () => {},
  };
  // parseExcelHeaders → mapColumns → previewImport 순차 실행
  const headersResult: any = await dispatcher.dispatch('parseExcelHeaders', { fileId }, ctx);
  const mapResult: any = await dispatcher.dispatch('mapColumns', { headers: headersResult.headers }, ctx);
  if (mapResult.status === 'mismatch') {
    return { card: { type: 'mappingError', matched: mapResult.matched, unmatched: mapResult.unmatched } };
  }
  // payments/students 구분 — 컬럼에 paymentDate/amount 있으면 payments
  const kind = ('paymentDate' in mapResult.mapping || 'amount' in mapResult.mapping) ? 'payments' : 'students';
  let captured: any = null;
  ctx.emit = (c) => { captured = c; };
  await dispatcher.dispatch('previewImport', { fileId, mapping: mapResult.mapping, kind }, ctx);
  return { card: captured };
});
```

(orgId/userId는 기존 auth store나 main 측 세션에서 가져옴 — 위치는 실제 코드 보고 조정)

- [ ] **Step 5: 커밋**

```bash
git add apps/tutomate/src/pages/ai-chat/components/ModelDownloadModal.tsx \
        apps/tutomate/src/pages/ai-chat/components/HardwareDiagnosticView.tsx \
        apps/tutomate/src/pages/ai-chat/components/DirectImportFallback.tsx \
        apps/tutomate/electron/ipc/aiHandler.ts \
        apps/tutomate-q/src/pages/ai-chat/components/ apps/tutomate-q/electron/ipc/aiHandler.ts
git commit -m "feat(ui): 모델 다운로드 모달 + 사양 진단 + 직접 임포트 폴백"
```

---

### Task 4.7: AiChatPage — ai:chat wire-up + 카드 인터랙션

**Files:**
- Modify: `apps/tutomate/src/pages/ai-chat/AiChatPage.tsx`

- [ ] **Step 1: 구현 보강**

`AiChatPage`의 `onSend` 콜백에서 ai:chat 호출 + 이벤트 처리 + 카드 클릭 핸들러:

```tsx
import { useEffect, useState, useCallback } from 'react';
import { useAuthStore } from '@tutomate/core';
// ...

export default function AiChatPage() {
  const orgId = useAuthStore((s) => s.currentOrgId);
  const userId = useAuthStore((s) => s.user?.id);
  const [messages, setMessages] = useState<any[]>([]);

  useEffect(() => {
    return window.electronAPI.onAiChatEvent((e: any) => {
      if (e.type === 'token') {
        setMessages((m) => {
          const last = m[m.length - 1];
          if (last?.role === 'assistant') {
            const updated = { ...last, content: last.content + e.token };
            return [...m.slice(0, -1), updated];
          }
          return [...m, { role: 'assistant', content: e.token }];
        });
      } else if (e.type === 'card') {
        setMessages((m) => {
          const last = m[m.length - 1];
          if (last?.role === 'assistant') {
            const cards = [...(last.cards ?? []), e.card];
            return [...m.slice(0, -1), { ...last, cards }];
          }
          return [...m, { role: 'assistant', content: '', cards: [e.card] }];
        });
      }
    });
  }, []);

  const handleSend = useCallback(async (text: string, attachment?: { fileId: string; name: string }) => {
    const userMsg = {
      role: 'user', content: text,
      attachments: attachment ? [{ fileId: attachment.fileId, name: attachment.name }] : undefined,
    };
    const next = [...messages, userMsg];
    setMessages(next);
    await window.electronAPI.aiChat({ messages: next, orgId, userId });
  }, [messages, orgId, userId]);

  // ImportPreviewCard의 [확정] 클릭 시: confirmImport를 시스템 메시지로 주입
  // (실제 구현은 카드 props에 onConfirm 콜백을 페이지에서 전달)

  // ... (Render: ChatWindow + ChatInput, 위 Task 4.3 골격 그대로)
}
```

- [ ] **Step 2: 카드 [확정] 콜백 전파**

`MessageBubble` 내부에서 `ImportPreviewCard` 렌더 시 `onConfirm`을 페이지에서 prop으로 전달:
```tsx
// MessageBubble.tsx의 renderCard 함수에 onConfirm/onCancel 콜백 받도록 변경
// AiChatPage에서:
const handleConfirm = (card: any) => {
  handleSend(`확정해줘`, undefined); // LLM이 다음 turn에 confirmImport를 호출하도록 유도
};
```

> 주: 더 견고한 방법은 `confirmImport`를 직접 dispatcher.dispatch로 호출하고 결과 카드를 push (LLM 우회). 단순화·결정론을 위해 그렇게 구현 권장. AI:chat과 별도로 `ai:dispatch-tool` IPC 추가 후 카드 버튼이 직접 호출.

- [ ] **Step 3: 커밋**

```bash
git add apps/tutomate/src/pages/ai-chat/AiChatPage.tsx \
        apps/tutomate-q/src/pages/ai-chat/AiChatPage.tsx
git commit -m "feat(ui): AiChatPage wire-up — ai:chat 이벤트 처리 + 카드 인터랙션"
```

---

## Phase 5 — 통합·골든·릴리스

### Task 5.1: 골든 양식 30개 회귀 테스트

**Files:**
- Create: `packages/core/src/mapping/__tests__/golden/`(폴더에 30개 .xlsx 또는 헤더 정의 JSON)
- Create: `packages/core/src/mapping/__tests__/golden.test.ts`

- [ ] **Step 1: 골든 케이스 정의 (헤더만 텍스트로 — 실제 xlsx 30개 수집은 별도)**

```typescript
// golden.test.ts
import { describe, it, expect } from 'vitest';
import { tryRuleMapping } from '../ColumnMapper';

const GOLDEN: { name: string; headers: string[]; expectedOk: boolean }[] = [
  { name: '표준 양식', headers: ['이름','연락처','결제일','금액'], expectedOk: true },
  { name: '괄호 변형', headers: ['이름','전화번호(휴대)','결제일자','수강료(원)'], expectedOk: true },
  { name: '영어 혼용', headers: ['name','phone','paymentDate','amount'], expectedOk: true },
  { name: '도메인 변형 (공방)', headers: ['회원명','연락처','강습료','등록일'], expectedOk: true },
  // ... 30개로 확장. 일부는 expectedOk:false 로 미매칭 케이스 검증
  { name: '미매칭 컬럼 포함', headers: ['이름','도시락여부'], expectedOk: false },
];

describe('golden 매핑 회귀', () => {
  for (const c of GOLDEN) {
    it(c.name, () => {
      const r = tryRuleMapping(c.headers);
      expect(r.status === 'ok').toBe(c.expectedOk);
    });
  }
});
```

- [ ] **Step 2: 30개 채워넣기 (수집한 실제 양식 기반)**

(이 단계는 사용자/QA가 실제 학원·공방 양식 수집 시 점진적으로 확장)

- [ ] **Step 3: 커밋**

```bash
git add packages/core/src/mapping/__tests__/golden.test.ts
git commit -m "test(mapping): golden 매핑 회귀 (초기 5개, 30개로 확장 예정)"
```

---

### Task 5.2: 챗봇 Q&A 골든 (수동 검증용)

**Files:**
- Create: `docs/superpowers/specs/chatbot-qa-golden.md`

- [ ] **Step 1: Q&A 50쌍 문서**

```markdown
# 챗봇 골든 Q&A (수동 회귀용)

각 항목: 사용자 질문 + 호출되어야 할 도구 시퀀스 + 답변 형식.

## 결제 조회
1. "민준이 결제 언제 했더라?"
   - tools: searchStudent({name:"민준"}) → getPaymentHistory({studentId})
   - answer: "○○○ 학생은 YYYY-MM-DD에 X원 결제하셨어요."

## 미납 조회
2. "이번 달 미납 누구야?"
   - tools: getUnpaidStudents()
   - answer: "이번 달 미납자는 N명입니다: …"

## 출석
3. "지난달 ○○ 학생 출석 어땠어?"
   - tools: searchStudent → getAttendance({period:"2026-04"})
   - answer: "총 N회 중 출석 K회…"

## 임포트 시나리오
4. (파일 첨부) "이거 결제 추가해줘"
   - tools: parseExcelHeaders → mapColumns → previewImport → (확정 클릭) → confirmImport
   - cards: importPreview → importResult

(... 50쌍까지 확장)
```

- [ ] **Step 2: 커밋**

```bash
git add docs/superpowers/specs/chatbot-qa-golden.md
git commit -m "docs: 챗봇 골든 Q&A 문서 (수동 회귀용)"
```

---

### Task 5.3: 통합 스모크 테스트 (수동)

**Files:**
- Create: `docs/superpowers/specs/chatbot-smoke-checklist.md`

- [ ] **Step 1: 체크리스트 작성**

```markdown
# 챗봇 통합 스모크 체크리스트 (수동)

## 환경
- [ ] 16GB RAM Mac/Win 빌드
- [ ] 8GB RAM Win 빌드 (성능 게이트 검증)
- [ ] 4GB Win VM (block 분기 검증)

## 시나리오
- [ ] 첫 진입 → 다운로드 모달 표시 + 사양 진단 노출
- [ ] 다운로드 진행률 표시 + 중단 후 재개
- [ ] 다운로드 완료 → 챗봇 사용 가능
- [ ] "○○ 학생 결제 언제?" → 정확한 답변 + 출처 카드
- [ ] 엑셀 첨부 → 표준 양식 → preview 카드 → 확정 → result 카드 → DB upsert 확인
- [ ] 엑셀 첨부 → 비표준 헤더 1개 포함 → mappingError 카드
- [ ] 8GB PC: "응답이 10~20초 걸릴 수 있어요" 안내 표시
- [ ] 4GB PC: 챗봇 비활성, 직접 임포트 폼만 노출
- [ ] 직접 임포트 폼 → 표준 양식 업로드 → preview → 확정
- [ ] 모델 삭제 → 다시 다운로드 가능
- [ ] 매핑 캐시: 동일 헤더 두 번째 업로드 시 즉시 매핑 (mapColumns가 cacheHit:true)
```

- [ ] **Step 2: 커밋**

```bash
git add docs/superpowers/specs/chatbot-smoke-checklist.md
git commit -m "docs: 챗봇 통합 스모크 체크리스트"
```

---

### Task 5.4: 릴리스 준비

- [ ] **Step 1: CHANGELOG**

`CHANGELOG.md`에 새 기능 항목 추가:
```markdown
## v0.7.0
- AI 챗봇 추가 (수강생 조회·요약 + 엑셀 첨부 임포트)
- 풀로컬 LLM (Qwen 2.5 3B) 온디맨드 다운로드 (~2GB)
- 4GB 미만 PC: AI 비활성, 엑셀 직접 임포트만 가능
```

- [ ] **Step 2: 버전 범프**

```bash
# apps/tutomate/package.json + apps/tutomate-q/package.json
# version → 0.7.0
```

- [ ] **Step 3: 릴리스 (CLAUDE.md의 ./scripts/release-win.sh 또는 수동)**

```bash
./scripts/release-win.sh 0.7.0
```

- [ ] **Step 4: 릴리스 노트 (사용자 관점)**

```bash
gh release edit v0.7.0 --notes "## v0.7.0
- AI 어시스턴트 추가 (말로 학생 조회 + 엑셀 자동 정리)
- 첫 사용 시 AI 모델을 한 번 받으면 인터넷 없이 동작
- 기타 버그 수정"
```

---

## 자가 점검 결과 (작성자 메모)

- 스펙의 모든 컴포넌트(ExcelParser/ColumnMapper/DataNormalizer/FileStash/HardwareDiagnostic/ModelManager/LlamaRuntime/Dispatcher/Tools×14/Smart Cards×4/Pages/IPC) → 각 태스크 매핑 ✓
- 사양 분기 ok/warn/block → Task 2.1~2.2, 4.6 ✓
- 매핑 캐시 학습 → Task 1.7, 3.4 (cacheHit 플래그) ✓
- 직접 임포트 폴백 → Task 4.6 ✓
- 골든 데이터셋 → Task 5.1, 5.2 (점진적 확장 명시) ✓
- 모델 sha256: Task 2.5에 'TBD-FILL-AFTER-FIRST-DOWNLOAD' 마커 — **실 다운로드 전 측정 필요**
- LlamaRuntime의 tool_call → Dispatcher 라우팅: Task 2.6은 placeholder, Task 4.2에서 wire-up — 통합 시 함수 호출 루프 보강 필요 (node-llama-cpp의 functions API 결과를 dispatcher로 위임하는 어댑터)

## 미해결 (구현 중 결정)

- LlamaRuntime의 함수 호출 루프 — node-llama-cpp v3 API에 맞춰 어댑터 결정 (특히 toolCall 이벤트 추출과 결과 주입 방식)
- 매핑 시 students/payments 자동 구분 룰 (현재: paymentDate/amount 존재 여부)
- 카드 [확정] 후 confirmImport를 LLM 경유 vs 직접 dispatcher 호출 — 결정성 위해 후자 추천




