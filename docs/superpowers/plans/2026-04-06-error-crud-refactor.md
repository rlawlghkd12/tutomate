# 에러 처리 체계화 + CRUD 헬퍼 강화 구현 플랜

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 에러 코드 체계화, dataHelper 반환 타입 변경, 모든 store 패턴 통일로 사용자에게 에러 피드백 제공

**Architecture:** errors.ts에 ErrorCode + USER_ERROR_MESSAGES 추가 → supabaseStorage에서 PG 에러 코드 분류 → dataHelper가 throw 대신 결과/에러 반환 → store에서 서버 먼저 패턴 적용 + showError 호출

**Tech Stack:** TypeScript, Zustand, Supabase, Vitest

**Spec:** `docs/superpowers/specs/2026-04-06-error-crud-refactor-design.md`

---

### Task 1: ErrorCode + USER_ERROR_MESSAGES + AppError 변경

**Files:**
- Modify: `packages/core/src/utils/errors.ts`
- Test: `packages/core/src/utils/__tests__/errors.test.ts`

- [ ] **Step 1: errors.ts에 ErrorCode, USER_ERROR_MESSAGES 추가**

```ts
// packages/core/src/utils/errors.ts 파일 상단에 추가 (기존 ErrorType 아래)

export const ErrorCode = {
  NETWORK_OFFLINE: 'NETWORK_OFFLINE',
  NETWORK_TIMEOUT: 'NETWORK_TIMEOUT',
  DB_READ_FAILED: 'DB_READ_FAILED',
  DB_WRITE_FAILED: 'DB_WRITE_FAILED',
  DB_DUPLICATE: 'DB_DUPLICATE',
  DB_NOT_FOUND: 'DB_NOT_FOUND',
  DB_PERMISSION: 'DB_PERMISSION',
  ENROLLMENT_FULL: 'ENROLLMENT_FULL',
  ENROLLMENT_DUPLICATE: 'ENROLLMENT_DUPLICATE',
  PAYMENT_INVALID: 'PAYMENT_INVALID',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNKNOWN: 'UNKNOWN',
} as const;

export type ErrorCodeType = typeof ErrorCode[keyof typeof ErrorCode];

export const USER_ERROR_MESSAGES: Record<ErrorCodeType, string> = {
  NETWORK_OFFLINE: '인터넷 연결을 확인해주세요.',
  NETWORK_TIMEOUT: '서버 응답이 느립니다. 잠시 후 다시 시도해주세요.',
  DB_READ_FAILED: '데이터를 불러오지 못했습니다.',
  DB_WRITE_FAILED: '저장에 실패했습니다. 다시 시도해주세요.',
  DB_DUPLICATE: '이미 존재하는 데이터입니다.',
  DB_NOT_FOUND: '요청한 데이터를 찾을 수 없습니다.',
  DB_PERMISSION: '접근 권한이 없습니다.',
  ENROLLMENT_FULL: '강좌 정원이 마감되었습니다.',
  ENROLLMENT_DUPLICATE: '이미 등록된 강좌입니다.',
  PAYMENT_INVALID: '결제 정보를 확인해주세요.',
  VALIDATION_ERROR: '입력 정보를 확인해주세요.',
  UNKNOWN: '문제가 발생했습니다. 다시 시도해주세요.',
};
```

- [ ] **Step 2: AppError 클래스에 code 필드 추가 (type과 공존)**

기존 `type` 기반 생성자 유지 + 새 `code` 기반 생성자 추가. 마이그레이션 기간에 둘 다 지원.

```ts
// AppError 클래스 수정 — constructor에 code 옵셔널 추가
export class AppError extends Error {
  type: ErrorType;
  code: ErrorCodeType;
  originalError?: Error | unknown;
  component?: string;
  action?: string;
  recoverable: boolean;
  userMessage: string;

  constructor(options: AppErrorOptions & { code?: ErrorCodeType }) {
    super(options.message);
    this.name = 'AppError';
    this.type = options.type;
    this.code = options.code || this.typeToCode(options.type);
    this.originalError = options.originalError;
    this.component = options.component;
    this.action = options.action;
    this.recoverable = options.recoverable ?? true;
    this.userMessage = options.userMessage || USER_ERROR_MESSAGES[this.code];

    if (typeof (Error as any).captureStackTrace === 'function') {
      (Error as any).captureStackTrace(this, AppError);
    }
  }

  /** 기존 ErrorType → 새 ErrorCode 변환 (마이그레이션용) */
  private typeToCode(type: ErrorType): ErrorCodeType {
    const map: Record<string, ErrorCodeType> = {
      FILE_READ_ERROR: ErrorCode.DB_READ_FAILED,
      FILE_WRITE_ERROR: ErrorCode.DB_WRITE_FAILED,
      FILE_NOT_FOUND: ErrorCode.DB_NOT_FOUND,
      VALIDATION_ERROR: ErrorCode.VALIDATION_ERROR,
      DUPLICATE_ERROR: ErrorCode.DB_DUPLICATE,
      INVALID_DATA: ErrorCode.VALIDATION_ERROR,
      ENROLLMENT_ERROR: ErrorCode.ENROLLMENT_FULL,
      PAYMENT_ERROR: ErrorCode.PAYMENT_INVALID,
      NETWORK_ERROR: ErrorCode.NETWORK_OFFLINE,
      UNKNOWN_ERROR: ErrorCode.UNKNOWN,
    };
    return map[type] || ErrorCode.UNKNOWN;
  }

  toString(): string {
    return `[${this.code}] ${this.message}${this.component ? ` (${this.component})` : ''}`;
  }
}
```

- [ ] **Step 3: errors.test.ts 업데이트**

기존 테스트 유지 + 새 ErrorCode 기반 테스트 추가:

```ts
// errors.test.ts에 추가
describe('ErrorCode & USER_ERROR_MESSAGES', () => {
  it('모든 ErrorCode에 대응하는 USER_ERROR_MESSAGES가 있다', () => {
    for (const code of Object.values(ErrorCode)) {
      expect(USER_ERROR_MESSAGES[code]).toBeDefined();
      expect(typeof USER_ERROR_MESSAGES[code]).toBe('string');
    }
  });

  it('AppError — code 필드로 생성 시 userMessage 자동 매핑', () => {
    const err = new AppError({
      type: ErrorType.NETWORK_ERROR,
      message: 'test',
      code: ErrorCode.DB_DUPLICATE,
    });
    expect(err.code).toBe('DB_DUPLICATE');
    expect(err.userMessage).toBe('이미 존재하는 데이터입니다.');
  });

  it('AppError — code 없으면 type에서 자동 변환', () => {
    const err = new AppError({
      type: ErrorType.NETWORK_ERROR,
      message: 'test',
    });
    expect(err.code).toBe('NETWORK_OFFLINE');
  });

  it('AppError — toString()에 code 사용', () => {
    const err = new AppError({
      type: ErrorType.NETWORK_ERROR,
      message: 'fail',
      code: ErrorCode.DB_PERMISSION,
      component: 'TestComp',
    });
    expect(err.toString()).toBe('[DB_PERMISSION] fail (TestComp)');
  });
});
```

- [ ] **Step 4: 테스트 실행**

Run: `pnpm --filter @tutomate/core run test -- --reporter=default`
Expected: 모든 테스트 통과 (기존 + 신규)

- [ ] **Step 5: index.ts에서 새 export 추가**

```ts
// packages/core/src/index.ts — 기존 errors export 블록에 추가
export {
  ErrorType,
  ErrorCode,
  AppError,
  ErrorHandler,
  errorHandler,
  handleError,
  createError,
  setErrorDisplay,
  USER_ERROR_MESSAGES,
} from './utils/errors';
export type { AppErrorOptions, ErrorCodeType } from './utils/errors';
```

- [ ] **Step 6: 커밋**

```bash
git add packages/core/src/utils/errors.ts packages/core/src/utils/__tests__/errors.test.ts packages/core/src/index.ts
git commit -m "feat: ErrorCode + USER_ERROR_MESSAGES 추가, AppError에 code 필드"
```

---

### Task 2: supabaseStorage 에러 분류

**Files:**
- Modify: `packages/core/src/utils/supabaseStorage.ts`
- Test: `packages/core/src/utils/__tests__/supabaseStorage.test.ts`

- [ ] **Step 1: toAppError 변환 함수 추가**

```ts
// packages/core/src/utils/supabaseStorage.ts 상단에 추가
import { AppError, ErrorType, ErrorCode } from './errors';
import type { ErrorCodeType } from './errors';
import { logError } from './logger';
import { reportError } from './errorReporter';

function toAppError(error: unknown, operation: string, table: string): AppError {
  if (error instanceof AppError) return error;

  const pgCode = (error as any)?.code;
  let code: ErrorCodeType;

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    code = ErrorCode.NETWORK_OFFLINE;
  } else if (pgCode === '23505') {
    code = ErrorCode.DB_DUPLICATE;
  } else if (pgCode === '42501' || pgCode === '42503') {
    code = ErrorCode.DB_PERMISSION;
  } else if (pgCode === 'PGRST116') {
    code = ErrorCode.DB_NOT_FOUND;
  } else if (operation === 'load') {
    code = ErrorCode.DB_READ_FAILED;
  } else {
    code = ErrorCode.DB_WRITE_FAILED;
  }

  logError(`${operation} failed: ${table}`, { error, data: { code } });
  reportError(error instanceof Error ? error : new Error(String(error)));

  return new AppError({
    type: ErrorType.NETWORK_ERROR,
    message: `${operation} failed: ${table}`,
    code,
    originalError: error,
    component: 'supabaseStorage',
    action: operation,
  });
}
```

- [ ] **Step 2: 기존 throw를 toAppError로 교체**

모든 `supabaseLoadData`, `supabaseInsert`, `supabaseUpdate`, `supabaseDelete`, `supabaseBulkInsert` 에서:

```ts
// 변경 전:
throw new AppError({
  type: ErrorType.NETWORK_ERROR,
  message: `Failed to load from Supabase: ${table}`,
  originalError: error,
  component: "supabaseStorage",
  action: "supabaseLoadData",
});

// 변경 후:
throw toAppError(error, 'load', table);
```

5개 함수 모두 동일하게 변경:
- `supabaseLoadData` → `toAppError(error, 'load', table)`
- `supabaseInsert` → `toAppError(error, 'insert', table)`
- `supabaseUpdate` → `toAppError(error, 'update', table)`
- `supabaseDelete` → `toAppError(error, 'delete', table)`
- `supabaseBulkInsert` → `toAppError(error, 'bulkInsert', table)`

- [ ] **Step 3: supabaseStorage.test.ts 업데이트**

기존 테스트에서 에러의 `code` 필드 검증 추가:

```ts
it('load 실패 시 DB_READ_FAILED 코드', async () => {
  // ... mock 설정
  try {
    await supabaseLoadData('courses');
  } catch (e) {
    expect(e).toBeInstanceOf(AppError);
    expect((e as AppError).code).toBe('DB_READ_FAILED');
  }
});
```

- [ ] **Step 4: 테스트 실행**

Run: `pnpm --filter @tutomate/core run test -- --reporter=default`
Expected: 모든 테스트 통과

- [ ] **Step 5: 커밋**

```bash
git add packages/core/src/utils/supabaseStorage.ts packages/core/src/utils/__tests__/supabaseStorage.test.ts
git commit -m "feat: supabaseStorage PG 에러 코드 기반 분류 — toAppError"
```

---

### Task 3: dataHelper 반환 타입 변경

**Files:**
- Modify: `packages/core/src/utils/dataHelper.ts`
- Test: `packages/core/src/utils/__tests__/dataHelper.test.ts`

- [ ] **Step 1: LoadResult 타입 정의 + DataHelper 인터페이스 변경**

```ts
// packages/core/src/utils/dataHelper.ts — 상단에 타입 추가

import { AppError, ErrorCode } from './errors';

export type LoadResult<T> =
  | { status: 'ok'; data: T[] }
  | { status: 'skip' }
  | { status: 'cached'; data: T[] }
  | { status: 'error'; error: AppError };

// DataHelper 인터페이스 변경
export interface DataHelper<TLocal extends { id: string }, _TRow = unknown> {
  load: () => Promise<LoadResult<TLocal>>;
  add: (item: TLocal) => Promise<AppError | null>;
  update: (id: string, updates: Partial<TLocal>) => Promise<AppError | null>;
  remove: (id: string) => Promise<AppError | null>;
  invalidate: () => void;
}
```

- [ ] **Step 2: load() 구현 변경 — SkipLoadError 제거**

```ts
async load(): Promise<LoadResult<TLocal>> {
  if (isFresh()) {
    return { status: 'skip' };
  }

  try {
    const rows = await supabaseLoadData<TRow>(table);
    const items = rows.map(fromDb);
    lastLoadedAt = Date.now();
    saveCache(table, rows);
    return { status: 'ok', data: items };
  } catch (error) {
    logWarn(`Server load failed for ${table}, trying local cache`, { error });
    const cached = await loadCache<TRow>(table);
    if (cached && cached.length > 0) {
      logInfo(`Loaded ${cached.length} items from local cache: ${table}`);
      lastLoadedAt = Date.now();
      return { status: 'cached', data: cached.map(fromDb) };
    }
    const appError = error instanceof AppError ? error : new AppError({
      type: ErrorType.NETWORK_ERROR,
      message: `Failed to load: ${table}`,
      code: ErrorCode.DB_READ_FAILED,
      originalError: error,
    });
    return { status: 'error', error: appError };
  }
},
```

- [ ] **Step 3: add/update/remove 반환 타입 변경**

```ts
async add(item: TLocal): Promise<AppError | null> {
  const orgId = getOrgId();
  if (!orgId) {
    return new AppError({
      type: ErrorType.VALIDATION_ERROR,
      message: `No orgId — cannot insert into ${table}`,
      code: ErrorCode.DB_PERMISSION,
    });
  }
  try {
    await supabaseInsert(table, toDb(item, orgId));
    lastLoadedAt = 0; // invalidate
    return null;
  } catch (error) {
    return error instanceof AppError ? error : new AppError({
      type: ErrorType.NETWORK_ERROR,
      message: `Failed to add to ${table}`,
      code: ErrorCode.DB_WRITE_FAILED,
      originalError: error,
    });
  }
},

async update(id: string, updates: Partial<TLocal>): Promise<AppError | null> {
  try {
    await supabaseUpdate(table, id, updateToDb(updates));
    lastLoadedAt = 0; // invalidate
    return null;
  } catch (error) {
    return error instanceof AppError ? error : new AppError({
      type: ErrorType.NETWORK_ERROR,
      message: `Failed to update in ${table}`,
      code: ErrorCode.DB_WRITE_FAILED,
      originalError: error,
    });
  }
},

async remove(id: string): Promise<AppError | null> {
  try {
    await supabaseDelete(table, id);
    lastLoadedAt = 0; // invalidate
    return null;
  } catch (error) {
    return error instanceof AppError ? error : new AppError({
      type: ErrorType.NETWORK_ERROR,
      message: `Failed to delete from ${table}`,
      code: ErrorCode.DB_WRITE_FAILED,
      originalError: error,
    });
  }
},
```

- [ ] **Step 4: SkipLoadError 클래스 삭제**

파일 하단의 `class SkipLoadError` 전체 삭제.

- [ ] **Step 5: dataHelper.test.ts 업데이트**

```ts
it('load — fresh 상태면 status: skip 반환', async () => {
  const helper = createDataHelper(config);
  // 첫 번째 로드
  const result1 = await helper.load();
  expect(result1.status).toBe('ok');
  // 두 번째 로드 (fresh)
  const result2 = await helper.load();
  expect(result2.status).toBe('skip');
});

it('load — 서버 실패 + 캐시 있으면 status: cached', async () => {
  // ... mock 설정
  const result = await helper.load();
  expect(result.status).toBe('cached');
});

it('add — 성공 시 null 반환', async () => {
  const result = await helper.add(item);
  expect(result).toBeNull();
});

it('add — 실패 시 AppError 반환', async () => {
  // ... mock 설정
  const result = await helper.add(item);
  expect(result).toBeInstanceOf(AppError);
  expect(result?.code).toBe('DB_WRITE_FAILED');
});
```

- [ ] **Step 6: 테스트 실행**

Run: `pnpm --filter @tutomate/core run test -- --reporter=default`
Expected: 모든 테스트 통과

- [ ] **Step 7: index.ts에서 LoadResult 타입 export**

```ts
export { createDataHelper, clearAllCache } from './utils/dataHelper';
export type { DataHelper, LoadResult } from './utils/dataHelper';
```

- [ ] **Step 8: 커밋**

```bash
git add packages/core/src/utils/dataHelper.ts packages/core/src/utils/__tests__/dataHelper.test.ts packages/core/src/index.ts
git commit -m "feat: dataHelper LoadResult 반환 + SkipLoadError 제거"
```

---

### Task 4: courseStore 패턴 적용 (기준 store)

**Files:**
- Modify: `packages/core/src/stores/courseStore.ts`
- Test: `packages/core/src/stores/__tests__/courseStore.test.ts`

- [ ] **Step 1: courseStore 리팩터**

```ts
import dayjs from "dayjs";
import { create } from "zustand";
import type { Course, CourseFormData } from "../types";
import { createDataHelper } from "../utils/dataHelper";
import type { CourseRow } from "../utils/fieldMapper";
import { mapCourseFromDb, mapCourseToDb, mapCourseUpdateToDb } from "../utils/fieldMapper";
import { setErrorDisplay } from "../utils/errors";

const helper = createDataHelper<Course, CourseRow>({
  table: "courses",
  fromDb: mapCourseFromDb,
  toDb: mapCourseToDb,
  updateToDb: mapCourseUpdateToDb,
});

// showError 콜백 (setErrorDisplay로 설정됨)
let _showError: ((msg: string, recoverable: boolean) => void) | null = null;

// setErrorDisplay가 호출될 때 _showError도 설정
// errors.ts의 setErrorDisplay를 그대로 사용
function showError(msg: string) {
  if (_showError) _showError(msg, true);
}

interface CourseStore {
  courses: Course[];
  loadCourses: () => Promise<void>;
  invalidate: () => void;
  addCourse: (courseData: CourseFormData) => Promise<boolean>;
  updateCourse: (id: string, courseData: Partial<Course>) => Promise<boolean>;
  deleteCourse: (id: string) => Promise<boolean>;
  getCourseById: (id: string) => Course | undefined;
}

export const useCourseStore = create<CourseStore>((set, get) => ({
  courses: [],

  loadCourses: async () => {
    const result = await helper.load();
    if (result.status === 'ok' || result.status === 'cached') {
      set({ courses: result.data });
    }
    if (result.status === 'cached') {
      showError('오프라인 상태입니다. 저장된 데이터를 표시합니다.');
    }
    if (result.status === 'error') {
      showError(result.error.userMessage);
    }
  },

  invalidate: () => helper.invalidate(),

  addCourse: async (courseData: CourseFormData) => {
    const newCourse: Course = {
      ...courseData,
      id: crypto.randomUUID(),
      currentStudents: 0,
      createdAt: dayjs().toISOString(),
      updatedAt: dayjs().toISOString(),
    };
    const error = await helper.add(newCourse);
    if (error) {
      showError(error.userMessage);
      return false;
    }
    set({ courses: [...get().courses, newCourse] });
    return true;
  },

  updateCourse: async (id: string, courseData: Partial<Course>) => {
    const updates = { ...courseData, updatedAt: dayjs().toISOString() };
    const error = await helper.update(id, updates);
    if (error) {
      showError(error.userMessage);
      return false;
    }
    set({ courses: get().courses.map(c => c.id === id ? { ...c, ...updates } : c) });
    return true;
  },

  deleteCourse: async (id: string) => {
    const error = await helper.remove(id);
    if (error) {
      showError(error.userMessage);
      return false;
    }
    set({ courses: get().courses.filter(c => c.id !== id) });
    return true;
  },

  getCourseById: (id: string) => get().courses.find(c => c.id === id),
}));
```

참고: `showError`는 `errors.ts`의 기존 `_showError` 콜백을 직접 가져다 쓰는 대신, store 내부에서 `import { handleError } from '../utils/errors'`로 호출하는 것이 더 깔끔. 대안:

```ts
// 간단한 방식: handleError 직접 호출
import { handleError } from '../utils/errors';

// store 내에서:
if (error) {
  handleError(error);
  return false;
}
```

이 방식이 store마다 showError 변수를 안 만들어도 되므로 더 나음. `handleError`가 내부적으로 `_showError` 콜백 호출.

- [ ] **Step 2: courseStore.test.ts 업데이트**

helper mock 반환값을 throw → `AppError | null`로 변경:

```ts
// 기존: vi.spyOn(helper, 'add').mockRejectedValue(new Error('fail'))
// 변경: vi.spyOn(helper, 'add').mockResolvedValue(new AppError({ ... }))
```

- [ ] **Step 3: 테스트 실행**

Run: `pnpm --filter @tutomate/core run test -- --reporter=default`

- [ ] **Step 4: 커밋**

```bash
git add packages/core/src/stores/courseStore.ts packages/core/src/stores/__tests__/courseStore.test.ts
git commit -m "refactor: courseStore 에러 처리 패턴 적용"
```

---

### Task 5: studentStore 패턴 적용

**Files:**
- Modify: `packages/core/src/stores/studentStore.ts`
- Test: `packages/core/src/stores/__tests__/studentStore.test.ts`

courseStore과 동일한 패턴 적용:
- `loadStudents`: `LoadResult` 기반
- `addStudent/updateStudent/deleteStudent`: `AppError | null` 반환, 실패 시 `handleError`
- 반환 타입: `Promise<void>` → `Promise<boolean>`

- [ ] **Step 1: studentStore 리팩터** (courseStore 패턴 동일 적용)
- [ ] **Step 2: studentStore.test.ts 업데이트**
- [ ] **Step 3: 테스트 실행**
- [ ] **Step 4: 커밋**

```bash
git commit -m "refactor: studentStore 에러 처리 패턴 적용"
```

---

### Task 6: enrollmentStore 패턴 적용

**Files:**
- Modify: `packages/core/src/stores/enrollmentStore.ts`
- Test: `packages/core/src/stores/__tests__/enrollmentStore.test.ts`

courseStore 패턴 + 추가 메서드:
- `withdrawEnrollment`: `updateEnrollment` 호출이므로 자동 적용
- `updatePayment`: `updateEnrollment` 호출이므로 자동 적용

- [ ] **Step 1: enrollmentStore 리팩터**
- [ ] **Step 2: enrollmentStore.test.ts 업데이트**
- [ ] **Step 3: 테스트 실행**
- [ ] **Step 4: 커밋**

```bash
git commit -m "refactor: enrollmentStore 에러 처리 패턴 적용"
```

---

### Task 7: paymentRecordStore 패턴 적용

**Files:**
- Modify: `packages/core/src/stores/paymentRecordStore.ts`
- Test: `packages/core/src/stores/__tests__/paymentRecordStore.test.ts`

courseStore 패턴 + `syncEnrollmentTotal` 정리:
- `syncEnrollmentTotal`도 에러 발생 시 로그만 (사용자 알림 불필요 — 내부 동기화)

- [ ] **Step 1: paymentRecordStore 리팩터**
- [ ] **Step 2: paymentRecordStore.test.ts 업데이트**
- [ ] **Step 3: 테스트 실행**
- [ ] **Step 4: 커밋**

```bash
git commit -m "refactor: paymentRecordStore 에러 처리 패턴 적용"
```

---

### Task 8: monthlyPaymentStore 패턴 적용

**Files:**
- Modify: `packages/core/src/stores/monthlyPaymentStore.ts`
- Test: `packages/core/src/stores/__tests__/monthlyPaymentStore.test.ts`

- [ ] **Step 1: monthlyPaymentStore 리팩터**
- [ ] **Step 2: monthlyPaymentStore.test.ts 업데이트**
- [ ] **Step 3: 테스트 실행**
- [ ] **Step 4: 커밋**

```bash
git commit -m "refactor: monthlyPaymentStore 에러 처리 패턴 적용"
```

---

### Task 9: notificationStore 패턴 적용

**Files:**
- Modify: `packages/core/src/stores/notificationStore.ts`
- Test: `packages/core/src/stores/__tests__/notificationStore.test.ts`

- [ ] **Step 1: notificationStore 리팩터**
- [ ] **Step 2: notificationStore.test.ts 업데이트**
- [ ] **Step 3: 테스트 실행**
- [ ] **Step 4: 커밋**

```bash
git commit -m "refactor: notificationStore 에러 처리 패턴 적용"
```

---

### Task 10: settingsStore + lockStore 로깅 통일

**Files:**
- Modify: `packages/core/src/stores/settingsStore.ts`
- Modify: `packages/core/src/stores/lockStore.ts`
- Test: `packages/core/src/stores/__tests__/settingsStore.test.ts`
- Test: `packages/core/src/stores/__tests__/lockStore.test.ts`

이 두 store는 localStorage 전용이라 Supabase 에러 없음. `console.error` → `logError`로만 통일.

- [ ] **Step 1: settingsStore — console.error → logError 교체**
- [ ] **Step 2: lockStore — console.error → logError 교체**
- [ ] **Step 3: 테스트 실행**
- [ ] **Step 4: 커밋**

```bash
git commit -m "refactor: settingsStore/lockStore console.error → logError 통일"
```

---

### Task 11: 전체 테스트 + 정리

**Files:**
- All modified files

- [ ] **Step 1: 전체 테스트 실행**

Run: `pnpm --filter @tutomate/core run test -- --reporter=default`
Expected: 모든 테스트 통과

- [ ] **Step 2: TypeScript 빌드 확인**

Run: `cd apps/tutomate && npx tsc -b --noEmit && cd ../tutomate-q && npx tsc -b --noEmit`
Expected: 에러 없음

- [ ] **Step 3: 기존 ErrorType deprecated 주석 추가**

```ts
// errors.ts
/** @deprecated ErrorCode를 사용하세요 */
export const ErrorType = { ... } as const;
```

- [ ] **Step 4: 최종 커밋**

```bash
git commit -m "chore: ErrorType deprecated 처리 + 전체 테스트 통과 확인"
```
