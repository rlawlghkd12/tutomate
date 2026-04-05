# 에러 처리 체계화 + CRUD 헬퍼 강화

## 배경

현재 문제:
- 모든 store에서 빈 `catch {}` 블록으로 에러 무시
- 에러 타입 정의만 있고 실제 분류 안 됨 (전부 NETWORK_ERROR)
- ErrorHandler 정의만 되고 store에서 미사용
- 5가지 에러 처리 패턴 혼재
- 사용자 피드백(알림) 없음
- 캐시 갱신이 load()에서만 동작

## 설계

### 1. 에러 코드 체계

내부 코드(개발/로깅)와 사용자 메시지(한국어) 분리.

```ts
// packages/core/src/utils/errors.ts

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

### 2. AppError 클래스 변경

기존 `type` 필드를 `code`로 교체, `userMessage` 자동 매핑:

```ts
export class AppError extends Error {
  code: ErrorCodeType;
  userMessage: string;
  originalError?: unknown;
  component?: string;
  recoverable: boolean;

  constructor(opts: {
    code: ErrorCodeType;
    message?: string;
    userMessage?: string;
    originalError?: unknown;
    component?: string;
    recoverable?: boolean;
  }) {
    super(opts.message || opts.code);
    this.code = opts.code;
    this.userMessage = opts.userMessage || USER_ERROR_MESSAGES[opts.code];
    this.originalError = opts.originalError;
    this.component = opts.component;
    this.recoverable = opts.recoverable ?? true;
  }
}
```

### 3. Supabase 에러 변환 함수

`supabaseStorage.ts`에서 PostgreSQL 에러 코드 기반 분류:

```ts
function toAppError(error: unknown, operation: string, table: string): AppError {
  if (error instanceof AppError) return error;

  const pgCode = (error as any)?.code;
  let code: ErrorCodeType;

  if (!navigator.onLine) {
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

  logError(`${operation} failed: ${table}`, { error, code });
  reportError(error instanceof Error ? error : new Error(String(error)));

  return new AppError({ code, originalError: error });
}
```

### 4. dataHelper 변경

throw 대신 구조화된 결과 반환. SkipLoadError 제거.

```ts
// load 결과: 데이터 | skip | 에러 구분
type LoadResult<T> =
  | { status: 'ok'; data: T[] }
  | { status: 'skip' }                    // fresh — 기존 데이터 유지
  | { status: 'cached'; data: T[] }       // 서버 실패, 캐시 복구 — 오프라인 알림 가능
  | { status: 'error'; error: AppError }  // 캐시도 없음

interface DataHelper<TLocal, TRow> {
  load: () => Promise<LoadResult<TLocal>>;
  add: (item: TLocal) => Promise<AppError | null>;
  update: (id: string, updates: Partial<TLocal>) => Promise<AppError | null>;
  remove: (id: string) => Promise<AppError | null>;
  invalidate: () => void;
}
```

- `load()`: 4가지 상태를 명시적으로 반환. store에서 `cached` 시 "오프라인 데이터입니다" 알림 가능.
- `add/update/remove()`: 성공 시 `null`, 실패 시 `AppError` 반환. 성공 시 `invalidate()` 호출.

### 5. Store 패턴 통일

모든 store에서 동일한 패턴 — 서버 먼저, 성공 시 로컬 반영, 실패 시 사용자 알림:

```ts
// 조회
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
  // 'skip'이면 아무것도 안 함 (fresh)
},

// 생성
addCourse: async (courseData) => {
  const newCourse = { ...courseData, id: crypto.randomUUID(), ... };
  const error = await helper.add(newCourse);
  if (error) {
    showError(error.userMessage);
    return false;
  }
  set({ courses: [...get().courses, newCourse] });
  return true;
},

// 수정
updateCourse: async (id, updates) => {
  const error = await helper.update(id, updates);
  if (error) {
    showError(error.userMessage);
    return false;
  }
  set({ courses: get().courses.map(c => c.id === id ? { ...c, ...updates } : c) });
  return true;
},

// 삭제
deleteCourse: async (id) => {
  const error = await helper.remove(id);
  if (error) {
    showError(error.userMessage);
    return false;
  }
  set({ courses: get().courses.filter(c => c.id !== id) });
  return true;
},
```

`showError` 연결 방법:
- 기존 `setErrorDisplay` 콜백 패턴 유지 (App.tsx에서 toast 함수를 등록)
- store는 React 외부이므로 직접 toast 호출 불가 → 콜백 패턴이 맞음
- `showError(message: string, recoverable?: boolean)` 시그니처 유지

### 6. 적용 대상 store

| Store | CRUD 메서드 수 | 비고 |
|-------|-------------|------|
| courseStore | 4 (load, add, update, delete) | |
| studentStore | 4 | |
| enrollmentStore | 5 (+withdraw, updatePayment) | |
| paymentRecordStore | 4 (+sync) | syncEnrollmentTotal도 정리 |
| monthlyPaymentStore | 4 | |
| settingsStore | 2 (load, save) | localStorage 기반 |
| lockStore | 2 | localStorage 기반 |
| notificationStore | 3 | |

settingsStore/lockStore는 localStorage 전용이라 Supabase 에러 없음 — console.error → logError로만 통일.

### 7. 캐시 갱신

- `load()` 성공 시 캐시 저장 (기존 유지)
- `add/update/remove()` 성공 시 `invalidate()` 호출 → 다음 `load()`에서 서버 데이터 새로 가져옴
- 앱 재시작 시 캐시에서 복구 → 서버 동기화

### 8. 마이그레이션 전략

기존 `ErrorType` enum은 유지하되 deprecated 처리. 새 `ErrorCode`로 점진적 전환.
기존 `AppError` 인터페이스를 확장하여 `type`과 `code` 둘 다 지원. 전환 완료 후 `type` 제거.

## 영향 범위

- `packages/core/src/utils/errors.ts` — ErrorCode, AppError 변경
- `packages/core/src/utils/supabaseStorage.ts` — toAppError 변환
- `packages/core/src/utils/dataHelper.ts` — 반환 타입 변경, SkipLoadError 제거
- `packages/core/src/stores/*` — 8개 store 패턴 통일
- `packages/core/src/index.ts` — 새 export 추가

### 9. 테스트 업데이트 전략

기존 663개 테스트 중 영향받는 것:
- `errors.test.ts` — AppError 생성자 변경 (`type` → `code`). 마이그레이션 기간에는 둘 다 지원.
- store 테스트 (`courseStore.test.ts` 등) — helper mock 반환값 변경 (throw → `AppError | null`)
- `dataHelper.test.ts` — SkipLoadError 제거, LoadResult 타입 적용

순서:
1. errors.ts 변경 + errors.test.ts 업데이트
2. dataHelper 변경 + dataHelper.test.ts 업데이트
3. supabaseStorage 변경 + supabaseStorage.test.ts 업데이트
4. store별 순차 변경 + 각 store test 업데이트
5. 전체 테스트 통과 확인 후 deprecated `ErrorType` 제거

## 변경하지 않는 것

- DB 스키마
- UI 컴포넌트 (toast 표시는 기존 `setErrorDisplay` 메커니즘 사용)
- Edge Functions
