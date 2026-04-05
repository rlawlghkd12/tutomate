# Testing Strategy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 프로덕션 수준의 테스트 커버리지 확보 — utils → stores → hooks/oauth 순서로 기능 정의서 기반 테스트 작성

**Architecture:** 로컬 Supabase + 트랜잭션 롤백으로 DB 테스트 격리. Vitest Workspace로 모노레포 통합. 기능 정의서 → 테스트 → 코드 정리의 bottom-up 접근.

**Tech Stack:** Vitest 4.x, @vitest/coverage-v8, Supabase CLI (로컬), pg (트랜잭션 롤백), @testing-library/react + user-event (UI 테스트 — shadcn 전환 후)

---

## File Structure

### 신규 생성

| 파일 | 역할 |
|------|------|
| `vitest.workspace.ts` | 모노레포 Vitest workspace 설정 |
| `packages/core/src/__tests__/supabaseSetup.ts` | 로컬 Supabase 연결 + 트랜잭션 헬퍼 |
| `packages/core/src/utils/__tests__/quarterUtils.test.ts` | quarterUtils 테스트 (신규) |
| `packages/core/src/utils/__tests__/scheduleUtils.test.ts` | scheduleUtils 테스트 (신규) |
| `packages/core/src/utils/__tests__/search.test.ts` | search 테스트 (신규) |
| `packages/core/src/utils/__tests__/supabaseStorage.test.ts` | supabaseStorage 테스트 (신규) |
| `packages/core/src/stores/__tests__/paymentRecordStore.test.ts` | paymentRecordStore 테스트 (신규) |
| `packages/core/src/hooks/__tests__/useAutoLock.test.ts` | useAutoLock 테스트 (신규) |
| `packages/core/src/lib/oauth/__tests__/deeplink.test.ts` | deeplink 테스트 (신규) |
| `supabase/seed.sql` | 테스트용 시드 데이터 |

### 수정 대상

| 파일 | 변경 |
|------|------|
| `packages/core/vitest.config.ts` | workspace 전환에 맞게 수정 |
| `packages/core/src/__tests__/setup.ts` | 트랜잭션 헬퍼 통합 |
| `packages/core/package.json` | pg, @vitest/coverage-v8 devDependency 추가 |
| `package.json` (root) | test 스크립트 workspace 기반으로 변경 |
| 기존 7개 utils 테스트 파일 | 기능 정의서 기반 보강 |
| 기존 9개 stores 테스트 파일 | 기능 정의서 기반 보강 |

---

## Task 1: Vitest Workspace + 커버리지 설정

**Files:**
- Create: `vitest.workspace.ts`
- Modify: `packages/core/vitest.config.ts`
- Modify: `packages/core/package.json`
- Modify: `package.json` (root)

- [ ] **Step 1: packages/core에 coverage 의존성 추가**

```bash
cd /Users/kjh/dev/tutomate && pnpm --filter @tutomate/core add -D @vitest/coverage-v8
```

- [ ] **Step 2: 루트에 vitest.workspace.ts 생성**

```ts
// vitest.workspace.ts
import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  'packages/core/vitest.config.ts',
]);
```

> packages/ui는 shadcn 전환 후 추가한다. 현재는 core만.

- [ ] **Step 3: packages/core/vitest.config.ts에 커버리지 설정 추가**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/__tests__/**/*.test.ts'],
    setupFiles: ['src/__tests__/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/utils/**/*.ts', 'src/stores/**/*.ts', 'src/hooks/**/*.ts', 'src/lib/**/*.ts'],
      exclude: ['src/**/__tests__/**', 'src/types/**', 'src/config/**', 'src/index.ts'],
      thresholds: {
        branches: 95,
      },
    },
  },
});
```

- [ ] **Step 4: 루트 package.json test 스크립트 업데이트**

`package.json`의 `"test"` 스크립트를 `"vitest run --workspace vitest.workspace.ts"`로 변경. coverage 스크립트도 추가: `"test:coverage": "vitest run --workspace vitest.workspace.ts --coverage"`.

- [ ] **Step 5: 테스트 실행 확인**

```bash
cd /Users/kjh/dev/tutomate && pnpm test
```

Expected: 기존 16개 테스트 파일 모두 PASS

- [ ] **Step 6: 커밋**

```bash
git add vitest.workspace.ts packages/core/vitest.config.ts packages/core/package.json package.json pnpm-lock.yaml
git commit -m "chore: vitest workspace + coverage 설정"
```

---

## Task 2: 로컬 Supabase + 트랜잭션 헬퍼

**Files:**
- Create: `supabase/seed.sql`
- Create: `packages/core/src/__tests__/supabaseSetup.ts`
- Modify: `packages/core/src/__tests__/setup.ts`
- Modify: `packages/core/package.json`

- [ ] **Step 1: pg 의존성 추가**

```bash
cd /Users/kjh/dev/tutomate && pnpm --filter @tutomate/core add -D pg @types/pg
```

- [ ] **Step 2: seed.sql 생성**

`supabase/seed.sql`에 테스트용 시드 데이터를 작성한다. 기존 migration 스키마를 기반으로 courses, students, enrollments, monthly_payments, payment_records 테이블에 최소한의 시드 데이터를 삽입한다.

```sql
-- supabase/seed.sql
-- 테스트용 시드 데이터

-- 테스트 조직 (auth.users와 organizations는 마이그레이션에서 생성됨)
-- seed는 비즈니스 데이터만 삽입

-- 테스트용 과목
INSERT INTO courses (id, organization_id, name, fee, schedule, max_students, current_students, status, start_date)
VALUES
  ('course-1', 'test-org-1', '수학 기초', 200000, '{"days": [1,3], "startTime": "14:00", "endTime": "15:00"}', 10, 2, 'active', '2026-01-01'),
  ('course-2', 'test-org-1', '영어 회화', 150000, '{"days": [2,4], "startTime": "16:00", "endTime": "17:00"}', 8, 1, 'active', '2026-01-01'),
  ('course-3', 'test-org-1', '종료된 과목', 100000, '{"days": [5], "startTime": "10:00", "endTime": "11:00"}', 5, 0, 'ended', '2025-01-01');

-- 테스트용 학생
INSERT INTO students (id, organization_id, name, phone, parent_phone, school, grade, birth_date, notes)
VALUES
  ('student-1', 'test-org-1', '김학생', '010-1234-5678', '010-8765-4321', '서울중학교', 2, '2012-05-15', '수학 보충 필요'),
  ('student-2', 'test-org-1', '이학생', '010-2222-3333', '010-4444-5555', '강남고등학교', 1, '2010-11-20', NULL),
  ('student-3', 'test-org-1', '박학생', '010-6666-7777', NULL, NULL, NULL, NULL, '신규 등록');

-- 테스트용 수강 등록
INSERT INTO enrollments (id, organization_id, course_id, student_id, start_date, status)
VALUES
  ('enroll-1', 'test-org-1', 'course-1', 'student-1', '2026-01-01', 'active'),
  ('enroll-2', 'test-org-1', 'course-1', 'student-2', '2026-02-01', 'active'),
  ('enroll-3', 'test-org-1', 'course-2', 'student-1', '2026-01-15', 'active');

-- 테스트용 월별 납부
INSERT INTO monthly_payments (id, organization_id, enrollment_id, month, amount, status, paid_date)
VALUES
  ('mp-1', 'test-org-1', 'enroll-1', '2026-01', 200000, 'paid', '2026-01-05'),
  ('mp-2', 'test-org-1', 'enroll-1', '2026-02', 200000, 'unpaid', NULL),
  ('mp-3', 'test-org-1', 'enroll-2', '2026-02', 200000, 'paid', '2026-02-03');

-- 테스트용 납부 기록
INSERT INTO payment_records (id, organization_id, enrollment_id, amount, method, paid_date, quarter, month, notes)
VALUES
  ('pr-1', 'test-org-1', 'enroll-1', 200000, 'cash', '2026-01-05', '2026-Q1', 1, '1월분'),
  ('pr-2', 'test-org-1', 'enroll-1', 200000, 'transfer', '2026-02-03', '2026-Q1', 2, '2월분');
```

> 주의: 실제 스키마에 맞게 컬럼명을 조정해야 한다. `supabase/migrations/`의 initial_schema.sql을 반드시 참고할 것.

- [ ] **Step 3: supabaseSetup.ts 생성 — 트랜잭션 헬퍼**

```ts
// packages/core/src/__tests__/supabaseSetup.ts
import pg from 'pg';

let client: pg.Client | null = null;

/**
 * 로컬 Supabase PostgreSQL에 직접 연결.
 * globalSetup에서 한 번 호출하고, 각 테스트에서 트랜잭션으로 격리한다.
 */
export async function connectTestDb(): Promise<pg.Client> {
  if (client) return client;
  client = new pg.Client({
    host: '127.0.0.1',
    port: 54322,
    database: 'postgres',
    user: 'postgres',
    password: 'postgres',
  });
  await client.connect();
  return client;
}

export async function disconnectTestDb(): Promise<void> {
  if (client) {
    await client.end();
    client = null;
  }
}

export function getTestClient(): pg.Client {
  if (!client) throw new Error('Test DB not connected. Call connectTestDb() first.');
  return client;
}

/**
 * 각 테스트의 beforeEach에서 호출 — 트랜잭션 시작
 */
export async function beginTransaction(): Promise<void> {
  const c = getTestClient();
  await c.query('BEGIN');
}

/**
 * 각 테스트의 afterEach에서 호출 — 롤백으로 데이터 격리
 */
export async function rollbackTransaction(): Promise<void> {
  const c = getTestClient();
  await c.query('ROLLBACK');
}
```

- [ ] **Step 4: setup.ts에 로컬 Supabase 환경변수 설정 추가**

`packages/core/src/__tests__/setup.ts`를 수정하여, 테스트 환경에서 Supabase 클라이언트가 로컬 인스턴스를 바라보도록 환경변수를 설정한다.

```ts
import { vi } from 'vitest';

// 로컬 Supabase 환경변수 (supabase client가 참조)
process.env.VITE_SUPABASE_URL = 'http://127.0.0.1:54321';
process.env.VITE_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

// Mock window.electronAPI
Object.defineProperty(window, 'electronAPI', {
  value: undefined,
  writable: true,
});

// Mock antd message/notification (used by errors.ts)
vi.mock('antd', () => ({
  message: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
  notification: { error: vi.fn(), success: vi.fn() },
}));
```

> anon key는 Supabase CLI 로컬 기본값. `supabase status`로 확인 가능.

- [ ] **Step 5: 로컬 Supabase 시작 + DB 리셋 확인**

```bash
cd /Users/kjh/dev/tutomate && supabase start
supabase db reset
```

Expected: 마이그레이션 18개 적용 + seed 데이터 삽입 성공

- [ ] **Step 6: 테스트 실행 확인**

```bash
pnpm test
```

Expected: 기존 테스트 모두 PASS (환경변수 변경이 기존 mock을 깨지 않는지 확인)

- [ ] **Step 7: 커밋**

```bash
git add supabase/seed.sql packages/core/src/__tests__/supabaseSetup.ts packages/core/src/__tests__/setup.ts packages/core/package.json pnpm-lock.yaml
git commit -m "chore: 로컬 Supabase 연동 테스트 인프라 + 트랜잭션 헬퍼"
```

---

## Task 3: Utils 테스트 보강 — dataHelper, errors, formatters, logger

기존 테스트 파일을 기능 정의서 기반으로 보강한다. 각 파일에 대해: (1) 소스 코드 읽기 → (2) 기능 정의서 작성 (테스트 파일 상단 주석) → (3) 누락된 분기 테스트 추가 → (4) 실행 확인.

**Files:**
- Modify: `packages/core/src/utils/__tests__/dataHelper.test.ts`
- Modify: `packages/core/src/utils/__tests__/errors.test.ts`
- Modify: `packages/core/src/utils/__tests__/formatters.test.ts`
- Modify: `packages/core/src/utils/__tests__/logger.test.ts`

- [ ] **Step 1: 각 소스 파일 읽기**

소스 파일을 읽고 모든 public 함수, 분기, 에러 경로를 파악한다:
- `packages/core/src/utils/dataHelper.ts` (168줄) — `createDataHelper()`, `clearAllCache()`, `DataHelper<T>` 인터페이스
- `packages/core/src/utils/errors.ts` (184줄) — `ErrorType` enum, `AppError`, `ErrorHandler`, `handleError()`, `createError()`
- `packages/core/src/utils/formatters.ts` (30줄) — `formatPhone()`, `parseBirthDate()`
- `packages/core/src/utils/logger.ts` (99줄) — `Logger` class, `LogLevel` enum, 싱글턴

- [ ] **Step 2: 기능 정의서를 테스트 파일 상단 주석으로 작성**

각 테스트 파일 최상단에 `/** 기능 정의서 */` 블록 추가. 모든 동작 규칙, 에러 처리, 스코프 밖을 명시한다.

- [ ] **Step 3: dataHelper.test.ts 보강**

보강 포인트:
- 캐시 만료 (staleness 3분 기준): `Date.now()` mock으로 시간 경과 시뮬레이션
- 동시 로드: 같은 helper에 loadAll을 동시에 2번 호출 시 중복 요청 방지 확인
- 빈 데이터: supabase가 빈 배열 반환 시 정상 처리
- clearAllCache: 캐시 초기화 후 다음 load에서 실제 fetch 발생 확인

- [ ] **Step 4: errors.test.ts 보강**

보강 포인트:
- 모든 `ErrorType` enum 값에 대해 `createError()` 호출 → 올바른 타입 반환
- `AppError` 직렬화/역직렬화
- `ErrorHandler.handle()` — 각 에러 타입별 사용자 메시지 확인
- 네트워크 에러, 인증 에러, 알 수 없는 에러 분기
- `handleError()` 유틸 함수가 ErrorHandler.handle()을 위임하는지 확인

- [ ] **Step 5: formatters.test.ts 보강**

보강 포인트:
- `formatPhone('')` → 빈 문자열 반환
- `formatPhone(null)` / `formatPhone(undefined)` → 안전한 처리
- `formatPhone('01012345678')` → '010-1234-5678'
- 잘못된 길이의 전화번호 (9자리, 12자리)
- `parseBirthDate` — null, 빈 문자열, 잘못된 포맷

- [ ] **Step 6: logger.test.ts 보강**

보강 포인트:
- 각 로그 레벨(DEBUG, INFO, WARN, ERROR) 활성/비활성 조합
- `Logger.setLevel()` → 해당 레벨 이상만 출력
- 비활성 상태에서 `logDebug()` 호출 시 console.log 미호출

- [ ] **Step 7: 전체 테스트 실행**

```bash
pnpm --filter @tutomate/core test
```

Expected: 모든 테스트 PASS

- [ ] **Step 8: 커밋**

```bash
git add packages/core/src/utils/__tests__/dataHelper.test.ts packages/core/src/utils/__tests__/errors.test.ts packages/core/src/utils/__tests__/formatters.test.ts packages/core/src/utils/__tests__/logger.test.ts
git commit -m "test: dataHelper, errors, formatters, logger 테스트 보강"
```

---

## Task 4: Utils 테스트 보강 — notificationGenerator, export, fieldMapper

**Files:**
- Modify: `packages/core/src/utils/__tests__/notificationGenerator.test.ts`
- Modify: `packages/core/src/utils/__tests__/export.test.ts`
- Modify: `packages/core/src/utils/__tests__/fieldMapper.test.ts`

- [ ] **Step 1: 소스 코드 읽기**

- `notificationGenerator.ts` (87줄) — `generatePaymentOverdueNotifications()`, `generatePaymentReminderNotifications()`, `generateAllNotifications()`
- `export.ts` (431줄) — 6개 export 함수, 필드 정의
- `fieldMapper.ts` (319줄) — 5개 엔티티의 양방향 매핑 (fromDb, toDb, updateToDb)

- [ ] **Step 2: 기능 정의서 작성 (테스트 파일 상단 주석)**

- [ ] **Step 3: notificationGenerator.test.ts 보강**

보강 포인트:
- 미납 경계값: 정확히 납부일 당일, 납부일 하루 전, 납부일 하루 후
- 연체 경계값: 1일 연체, 30일 연체
- 빈 수강 목록: enrollment 0건일 때 빈 배열 반환
- 모든 납부 완료: 알림 0건 반환

- [ ] **Step 4: export.test.ts 보강**

보강 포인트:
- 빈 데이터 export: 빈 배열 → 헤더만 있는 파일 또는 에러
- 특수문자 포함 데이터: 이름에 쉼표, 줄바꿈 포함 시 CSV 이스케이프
- Excel/CSV 각각 6개 함수 모두 커버

- [ ] **Step 5: fieldMapper.test.ts 보강**

보강 포인트:
- null 필드 매핑: DB에서 null인 필드 → 앱 타입에서 적절한 기본값
- 타입 불일치: 숫자가 문자열로 들어온 경우
- 양방향 일관성: `mapXFromDb(mapXToDb(original))` === `original` (round-trip)
- 5개 엔티티 모두 커버 (Course, Student, Enrollment, MonthlyPayment, PaymentRecord)

- [ ] **Step 6: 테스트 실행**

```bash
pnpm --filter @tutomate/core test
```

- [ ] **Step 7: 커밋**

```bash
git add packages/core/src/utils/__tests__/notificationGenerator.test.ts packages/core/src/utils/__tests__/export.test.ts packages/core/src/utils/__tests__/fieldMapper.test.ts
git commit -m "test: notificationGenerator, export, fieldMapper 테스트 보강"
```

---

## Task 5: Utils 신규 테스트 — quarterUtils, scheduleUtils, search, supabaseStorage

**Files:**
- Create: `packages/core/src/utils/__tests__/quarterUtils.test.ts`
- Create: `packages/core/src/utils/__tests__/scheduleUtils.test.ts`
- Create: `packages/core/src/utils/__tests__/search.test.ts`
- Create: `packages/core/src/utils/__tests__/supabaseStorage.test.ts`

- [ ] **Step 1: 소스 코드 읽기**

- `quarterUtils.ts` (48줄) — `getCurrentQuarter()`, `getQuarterLabel()`, `getQuarterMonths()`, `getQuarterOptions()`, `quarterMonthToYYYYMM()`
- `scheduleUtils.ts` (116줄) — `generateClassDates()`, `getNextClassDate()`, `hasTodayClass()`, 진행률 함수들, 포맷 함수들
- `search.ts` (137줄) — `searchCourses()`, `searchStudents()`, `searchEnrollments()`, `searchAll()`, `highlightText()`
- `supabaseStorage.ts` (134줄) — `supabaseLoadData()`, `supabaseInsert()`, `supabaseUpdate()`, `supabaseDelete()`, `supabaseBulkInsert()`

- [ ] **Step 2: 기능 정의서 작성**

- [ ] **Step 3: quarterUtils.test.ts 작성**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getCurrentQuarter, getQuarterLabel, getQuarterMonths, getQuarterOptions, quarterMonthToYYYYMM } from '../quarterUtils';

describe('quarterUtils', () => {
  describe('getCurrentQuarter', () => {
    it('1월 → Q1', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-15'));
      expect(getCurrentQuarter()).toBe('2026-Q1');
      vi.useRealTimers();
    });

    it('4월 → Q2', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-04-01'));
      expect(getCurrentQuarter()).toBe('2026-Q2');
      vi.useRealTimers();
    });

    it('12월 → Q4', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-12-31'));
      expect(getCurrentQuarter()).toBe('2026-Q4');
      vi.useRealTimers();
    });
  });

  describe('getQuarterLabel', () => {
    it('2026-Q1 → 2026년 1분기', () => {
      expect(getQuarterLabel('2026-Q1')).toBe('2026년 1분기');
    });

    it('2025-Q4 → 2025년 4분기', () => {
      expect(getQuarterLabel('2025-Q4')).toBe('2025년 4분기');
    });
  });

  describe('getQuarterMonths', () => {
    it('Q1 → [1,2,3]', () => {
      expect(getQuarterMonths('2026-Q1')).toEqual([1, 2, 3]);
    });

    it('Q4 → [10,11,12]', () => {
      expect(getQuarterMonths('2026-Q4')).toEqual([10, 11, 12]);
    });
  });

  describe('getQuarterOptions', () => {
    it('현재 ±2 분기 = 5개 옵션 반환', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-04-01'));
      const options = getQuarterOptions();
      expect(options).toHaveLength(5);
      expect(options[0].value).toBe('2025-Q4'); // -2
      expect(options[2].value).toBe('2026-Q2'); // 현재
      expect(options[4].value).toBe('2026-Q4'); // +2
      vi.useRealTimers();
    });

    it('Q1에서 -2 → 전년도 Q3', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-15'));
      const options = getQuarterOptions();
      expect(options[0].value).toBe('2025-Q3');
      vi.useRealTimers();
    });
  });

  describe('quarterMonthToYYYYMM', () => {
    it('2026-Q1, 1 → 2026-01', () => {
      expect(quarterMonthToYYYYMM('2026-Q1', 1)).toBe('2026-01');
    });

    it('2026-Q4, 12 → 2026-12', () => {
      expect(quarterMonthToYYYYMM('2026-Q4', 12)).toBe('2026-12');
    });
  });
});
```

- [ ] **Step 4: scheduleUtils.test.ts 작성**

소스를 읽고 다음 시나리오를 커버한다:
- `generateClassDates()`: 정상 스케줄 → 날짜 배열, 빈 스케줄 → 빈 배열
- `getNextClassDate()`: 다음 수업일 계산, 오늘이 수업일인 경우
- `hasTodayClass()`: 오늘 요일이 스케줄에 포함/미포함
- 진행률 함수: 0/N, N/N, 중간값
- 포맷 함수: `getDayOfWeekLabel()`, `formatDaysOfWeek()`, `formatClassTime()`, `formatScheduleSummary()` — 빈 입력 포함

- [ ] **Step 5: search.test.ts 작성**

- `searchCourses()`: 키워드 매칭, 대소문자 무시, 빈 쿼리 → 전체 반환
- `searchStudents()`: 이름/전화번호 매칭
- `searchAll()`: 카테고리별 결과 통합
- `highlightText()`: 매칭 부분 하이라이트, 특수문자 포함 쿼리
- 한글 초성 검색 (코드에 있는 경우)

- [ ] **Step 6: supabaseStorage.test.ts 작성**

supabase mock 기반 테스트 (로컬 Supabase 연동은 store 테스트에서 진행):
- `supabaseLoadData()`: 정상 → 데이터 배열 반환, 에러 → AppError throw
- `supabaseInsert()`: 정상 → void, 에러 → AppError throw
- `supabaseUpdate()`: 정상 → void, 에러 → AppError throw
- `supabaseDelete()`: 정상 → void, 에러 → AppError throw
- `supabaseBulkInsert()`: 정상 → void, 빈 배열 → 즉시 반환 (쿼리 안 함), 에러 → AppError throw
- supabase 미설정 시: `Error("Supabase not configured")` throw

- [ ] **Step 7: 테스트 실행**

```bash
pnpm --filter @tutomate/core test
```

Expected: 기존 + 신규 4개 파일 모두 PASS

- [ ] **Step 8: 커밋**

```bash
git add packages/core/src/utils/__tests__/quarterUtils.test.ts packages/core/src/utils/__tests__/scheduleUtils.test.ts packages/core/src/utils/__tests__/search.test.ts packages/core/src/utils/__tests__/supabaseStorage.test.ts
git commit -m "test: quarterUtils, scheduleUtils, search, supabaseStorage 신규 테스트"
```

---

## Task 6: Stores 테스트 보강 — authStore, courseStore, studentStore

**Files:**
- Modify: `packages/core/src/stores/__tests__/authStore.test.ts`
- Modify: `packages/core/src/stores/__tests__/courseStore.test.ts`
- Modify: `packages/core/src/stores/__tests__/studentStore.test.ts`

- [ ] **Step 1: 소스 코드 읽기**

- `authStore.ts` (435줄) — `initialize()`, `activateCloud()`, `startTrial()`, `deactivateCloud()`, `signInWithOAuth()`, `handleOAuthCallback()`
- `courseStore.ts` (103줄) — CRUD + `getCourseById()`, `incrementCurrentStudents()`, `decrementCurrentStudents()`
- `studentStore.ts` (83줄) — CRUD + `getStudentById()`

- [ ] **Step 2: 기능 정의서 작성**

- [ ] **Step 3: authStore.test.ts 보강**

보강 포인트:
- OAuth 플로우: `signInWithOAuth()` 각 provider 호출 확인
- `handleOAuthCallback()`: 유효한 콜백 → 세션 설정, 잘못된 콜백 → 에러
- trial 만료: `startTrial()` 후 plan 상태 확인
- 조직 전환: `activateCloud()` 시 organizationId 변경
- anonymous → cloud 전환 시나리오
- 각 에러 분기: 네트워크 실패, 인증 실패 등

- [ ] **Step 4: courseStore.test.ts 보강**

보강 포인트:
- 삭제 시 연관 enrollment 처리 확인 (또는 에러)
- 중복 과목명 시 동작
- `incrementCurrentStudents()` / `decrementCurrentStudents()` → 경계값 (0 이하 감소 방지)
- 빈 상태에서 `getCourseById('nonexistent')` → undefined

- [ ] **Step 5: studentStore.test.ts 보강**

보강 포인트:
- 삭제 시 연관 데이터 cascade
- 중복 학생 등록
- `getStudentById('nonexistent')` → undefined
- 빈 상태에서 `loadStudents()` → 빈 배열

- [ ] **Step 6: 테스트 실행**

```bash
pnpm --filter @tutomate/core test
```

- [ ] **Step 7: 커밋**

```bash
git add packages/core/src/stores/__tests__/authStore.test.ts packages/core/src/stores/__tests__/courseStore.test.ts packages/core/src/stores/__tests__/studentStore.test.ts
git commit -m "test: authStore, courseStore, studentStore 테스트 보강"
```

---

## Task 7: Stores 테스트 보강 — enrollmentStore, licenseStore, lockStore

**Files:**
- Modify: `packages/core/src/stores/__tests__/enrollmentStore.test.ts`
- Modify: `packages/core/src/stores/__tests__/licenseStore.test.ts`
- Modify: `packages/core/src/stores/__tests__/lockStore.test.ts`

- [ ] **Step 1: 소스 코드 읽기**

- `enrollmentStore.ts` (168줄)
- `licenseStore.ts` (155줄)
- `lockStore.ts` (102줄)

- [ ] **Step 2: 기능 정의서 작성**

- [ ] **Step 3: enrollmentStore.test.ts 보강**

보강 포인트:
- 이미 등록된 학생 재등록 시 동작
- 만료된 수강 상태 전환
- `getEnrollmentsByCourseId()` / `getEnrollmentsByStudentId()` 필터링
- `updatePayment()` — 정상/에러 분기
- `deleteEnrollment()` — 연관 monthly_payments 정리 확인

- [ ] **Step 4: licenseStore.test.ts 보강**

보강 포인트:
- 활성화: 유효 키 → success, 잘못된 형식 → invalid_format, 잘못된 키 → invalid
- `max_seats_reached` 분기
- 만료 라이선스 감지
- 기기 변경 시 동작 (`deviceId`)
- `getPlan()` — 활성 라이선스 시 plan 반환, 미활성 시 기본값
- `getLimit()` — plan별 제한 반환

- [ ] **Step 5: lockStore.test.ts 보강**

보강 포인트:
- `verifyPin()`: 맞음 → true + 잠금 해제, 틀림 → false + 잠금 유지
- 자동잠금 타이머 설정: `setAutoLockMinutes(0)` → 비활성
- `lock()` / `unlock()` 상태 전환
- `saveLockSettings()` / `loadLockSettings()` — localStorage round-trip

- [ ] **Step 6: 테스트 실행**

```bash
pnpm --filter @tutomate/core test
```

- [ ] **Step 7: 커밋**

```bash
git add packages/core/src/stores/__tests__/enrollmentStore.test.ts packages/core/src/stores/__tests__/licenseStore.test.ts packages/core/src/stores/__tests__/lockStore.test.ts
git commit -m "test: enrollmentStore, licenseStore, lockStore 테스트 보강"
```

---

## Task 8: Stores 테스트 보강/신규 — monthlyPaymentStore, notificationStore, settingsStore, paymentRecordStore

**Files:**
- Modify: `packages/core/src/stores/__tests__/monthlyPaymentStore.test.ts`
- Modify: `packages/core/src/stores/__tests__/notificationStore.test.ts`
- Modify: `packages/core/src/stores/__tests__/settingsStore.test.ts`
- Create: `packages/core/src/stores/__tests__/paymentRecordStore.test.ts`

- [ ] **Step 1: 소스 코드 읽기**

- `monthlyPaymentStore.ts` (123줄)
- `notificationStore.ts` (88줄)
- `settingsStore.ts` (76줄)
- `paymentRecordStore.ts` (164줄)

- [ ] **Step 2: 기능 정의서 작성**

- [ ] **Step 3: monthlyPaymentStore.test.ts 보강**

보강 포인트:
- 납부/미납 상태 전환
- 중복 납부 방지 (같은 enrollment_id + month)
- 월 경계값: '2026-01', '2026-12'
- `getPaymentsByMonth()` 필터링 정확성
- `deletePaymentsByEnrollmentId()` — 해당 enrollment의 모든 납부 삭제

- [ ] **Step 4: notificationStore.test.ts 보강**

보강 포인트:
- `markAsRead()` → isRead 상태 변경
- `markAllAsRead()` → 모든 알림 읽음 처리
- `getUnreadCount()` — 정확한 카운트
- `clearAll()` → 빈 배열
- 빈 상태에서 각 메서드 호출 시 안전한 처리

- [ ] **Step 5: settingsStore.test.ts 보강**

보강 포인트:
- 각 setter: `setTheme('dark')`, `setFontSize('large')` 등
- `loadSettings()` / `saveSettings()` — localStorage round-trip
- 잘못된 값 설정 시 동작 (존재하지 않는 theme 값 등)

- [ ] **Step 6: paymentRecordStore.test.ts 신규 작성**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { usePaymentRecordStore } from '../paymentRecordStore';

describe('paymentRecordStore', () => {
  beforeEach(() => {
    usePaymentRecordStore.setState({ records: [], _lastLoaded: 0 });
  });

  describe('loadRecords', () => {
    it('로드 성공 시 records 배열 설정', async () => {
      // supabase mock 기반 테스트
    });
  });

  describe('getRecordsByEnrollmentId', () => {
    it('해당 enrollment의 records만 필터링', () => {
      // state에 테스트 데이터 설정 후 필터링 확인
    });
  });

  describe('addPayment', () => {
    it('정상 추가 → records에 포함', async () => {});
    it('중복 납부 시 동작 확인', async () => {});
  });

  describe('updateRecord', () => {
    it('기존 record 업데이트', async () => {});
  });

  describe('deletePayment', () => {
    it('삭제 후 records에서 제거', async () => {});
  });

  describe('deletePaymentsByEnrollmentId', () => {
    it('해당 enrollment의 모든 records 삭제', async () => {});
  });
});
```

> 위는 뼈대. 실제 작성 시 소스 코드의 모든 분기를 커버하는 구체적인 테스트를 작성한다.

- [ ] **Step 7: 테스트 실행**

```bash
pnpm --filter @tutomate/core test
```

- [ ] **Step 8: 커밋**

```bash
git add packages/core/src/stores/__tests__/monthlyPaymentStore.test.ts packages/core/src/stores/__tests__/notificationStore.test.ts packages/core/src/stores/__tests__/settingsStore.test.ts packages/core/src/stores/__tests__/paymentRecordStore.test.ts
git commit -m "test: monthlyPaymentStore, notificationStore, settingsStore 보강 + paymentRecordStore 신규"
```

---

## Task 9: Hooks + OAuth 테스트 — useAutoLock, deeplink

**Files:**
- Create: `packages/core/src/hooks/__tests__/useAutoLock.test.ts`
- Create: `packages/core/src/lib/oauth/__tests__/deeplink.test.ts`

- [ ] **Step 1: 소스 코드 읽기**

- `useAutoLock.ts` (41줄) — 활동 감지 기반 자동잠금 React hook
- `deeplink.ts` (26줄) — OAuth 콜백 URL 파싱

- [ ] **Step 2: 기능 정의서 작성**

- [ ] **Step 3: useAutoLock.test.ts 작성**

React hook 테스트이므로 `@testing-library/react`의 `renderHook` 사용:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAutoLock } from '../useAutoLock';
import { useLockStore } from '../../stores/lockStore';

describe('useAutoLock', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useLockStore.setState({
      isEnabled: true,
      isLocked: false,
      autoLockMinutes: 5,
      pin: '1234',
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('autoLockMinutes 후 자동 잠금', () => {
    renderHook(() => useAutoLock());
    vi.advanceTimersByTime(5 * 60 * 1000);
    expect(useLockStore.getState().isLocked).toBe(true);
  });

  it('활동 감지 시 타이머 리셋', () => {
    renderHook(() => useAutoLock());
    vi.advanceTimersByTime(4 * 60 * 1000);
    // 사용자 활동 시뮬레이션
    window.dispatchEvent(new Event('mousemove'));
    vi.advanceTimersByTime(4 * 60 * 1000);
    expect(useLockStore.getState().isLocked).toBe(false);
  });

  it('isEnabled false → 잠금 안 함', () => {
    useLockStore.setState({ isEnabled: false });
    renderHook(() => useAutoLock());
    vi.advanceTimersByTime(10 * 60 * 1000);
    expect(useLockStore.getState().isLocked).toBe(false);
  });

  it('autoLockMinutes 0 → 비활성', () => {
    useLockStore.setState({ autoLockMinutes: 0 });
    renderHook(() => useAutoLock());
    vi.advanceTimersByTime(60 * 60 * 1000);
    expect(useLockStore.getState().isLocked).toBe(false);
  });
});
```

> 주의: `@testing-library/react`가 packages/core에 없을 수 있다. 필요시 devDependency 추가.

- [ ] **Step 4: @testing-library/react 의존성 추가 (필요 시)**

```bash
pnpm --filter @tutomate/core add -D @testing-library/react @testing-library/user-event
```

- [ ] **Step 5: deeplink.test.ts 작성**

```ts
import { describe, it, expect } from 'vitest';
import { parseOAuthCallback } from '../deeplink';

describe('parseOAuthCallback', () => {
  it('유효한 콜백 URL에서 토큰 추출', () => {
    const url = 'tutomate://oauth/callback?access_token=abc123&refresh_token=def456';
    const result = parseOAuthCallback(url);
    expect(result).toEqual({
      access_token: 'abc123',
      refresh_token: 'def456',
    });
  });

  it('잘못된 URL → 에러 또는 null', () => {
    expect(() => parseOAuthCallback('')).toThrow();
  });

  it('토큰 누락 시 처리', () => {
    const url = 'tutomate://oauth/callback?access_token=abc123';
    // refresh_token 없는 경우 동작 확인 (소스 코드에 따라 조정)
  });

  it('다른 프로토콜 URL', () => {
    const url = 'https://example.com/callback?access_token=abc123&refresh_token=def456';
    // 프로토콜 무관하게 파싱되는지 확인
  });
});
```

> 소스(26줄)에 맞게 실제 시그니처/반환 타입 기준으로 조정 필요.

- [ ] **Step 6: 테스트 실행**

```bash
pnpm --filter @tutomate/core test
```

- [ ] **Step 7: 커밋**

```bash
git add packages/core/src/hooks/__tests__/useAutoLock.test.ts packages/core/src/lib/oauth/__tests__/deeplink.test.ts packages/core/package.json pnpm-lock.yaml
git commit -m "test: useAutoLock, deeplink 신규 테스트"
```

---

## Task 10: 커버리지 확인 + 불필요 코드 정리

**Files:**
- 대상: 커버리지 리포트에서 발견되는 미커버 분기

- [ ] **Step 1: 커버리지 리포트 생성**

```bash
cd /Users/kjh/dev/tutomate && pnpm test:coverage
```

- [ ] **Step 2: 미커버 분기 분석**

coverage 리포트를 읽고, branches 95% 미달인 파일을 식별한다. 기능 정의서에 없는 분기(방어 코드, dead code)는 코드에서 제거한다. 정의서에 있는데 테스트가 누락된 분기는 테스트를 추가한다.

- [ ] **Step 3: 필요한 테스트 추가 / 코드 정리**

- [ ] **Step 4: 커버리지 재확인**

```bash
pnpm test:coverage
```

Expected: branches ≥ 95%

- [ ] **Step 5: 커밋**

```bash
git add -u
git commit -m "test: 커버리지 95% 달성 — 미커버 분기 보강 + 불필요 코드 제거"
```
