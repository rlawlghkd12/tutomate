# TutorMate 테스트 계획

## 테스트 프레임워크

**Vitest** 사용 (Vite 프로젝트에 최적, Jest API 호환, ESM 네이티브 지원)

```
npm i -D vitest @testing-library/react @testing-library/jest-dom jsdom
```

## 테스트 우선순위

아키텍처 리뷰 결과 기반으로 비즈니스 임팩트 + 버그 가능성 순으로 정렬.

---

## Tier 1: 비즈니스 로직 (순수 함수, 외부 의존성 없음)

### 1-1. fieldMapper — DB ↔ App 타입 변환

**파일:** `src/utils/fieldMapper.ts`
**테스트 파일:** `src/utils/__tests__/fieldMapper.test.ts`

외부 의존성 없는 순수 함수. 모든 스토어의 데이터 무결성 기반.

| 테스트 케이스 | 설명 |
|-------------|------|
| `mapCourseFromDb` | snake_case → camelCase 변환, `schedule: null` → `undefined` |
| `mapCourseToDb` | camelCase → snake_case 변환, `schedule: undefined` → `null` |
| `mapCourseUpdateToDb` | partial 업데이트 시 정의된 필드만 매핑 |
| `mapStudentFromDb` | nullable 필드 (`email`, `address`, `birthDate`) → `undefined` 변환 |
| `mapStudentToDb` | `undefined` → `null` 변환 |
| `mapEnrollmentFromDb` | `payment_status` string → union type 캐스팅, `discount_amount` null → 0 |
| `mapEnrollmentToDb` | `enrolledAt` → `enrolled_at` + `created_at` 동시 매핑 |
| `mapEnrollmentUpdateToDb` | `discountAmount` → `discount_amount` 매핑, 미정의 필드 제외 |
| `mapMonthlyPaymentFromDb` | `payment_method` nullable 처리 |
| `mapMonthlyPaymentUpdateToDb` | partial 업데이트 정확성 |

### 1-2. errors — AppError 클래스

**파일:** `src/utils/errors.ts`
**테스트 파일:** `src/utils/__tests__/errors.test.ts`

ErrorHandler는 antd 의존이 있어 mock 필요하지만, AppError 클래스 자체는 순수.

| 테스트 케이스 | 설명 |
|-------------|------|
| `AppError` 기본 생성 | type, message, recoverable 기본값 (true) |
| `AppError` 커스텀 userMessage | 지정 시 기본 메시지 대신 사용 |
| `getDefaultUserMessage` | 각 ErrorType별 한국어 메시지 반환 |
| `toString()` | `[TYPE] message (component)` 포맷 |
| `recoverable: false` | 명시적 false 전달 시 반영 |

### 1-3. updatePayment 결제 로직 (핵심 비즈니스)

**파일:** `src/stores/enrollmentStore.ts` → `updatePayment`
**테스트 파일:** `src/stores/__tests__/enrollmentStore.test.ts`

결제 상태 계산은 앱의 핵심 비즈니스 로직. Supabase mock 필요.

| 테스트 케이스 | 설명 |
|-------------|------|
| 전액 납부 | `paidAmount === effectiveFee` → `completed`, `remainingAmount: 0` |
| 부분 납부 | `0 < paidAmount < effectiveFee` → `partial`, 잔액 계산 |
| 미납 | `paidAmount === 0` → `pending`, `remainingAmount === effectiveFee` |
| 면제 | `isExempt: true` → `exempt`, `paidAmount: 0`, `remainingAmount: 0` |
| 할인 적용 | `totalFee: 100000, discountAmount: 20000` → `effectiveFee: 80000` 기준 |
| 할인 + 전액 납부 | 할인 적용 후 금액으로 `completed` 판정 |
| 할인 + 부분 납부 | 할인 적용 후 금액으로 `partial` 판정, 잔액 정확성 |
| 기존 할인 유지 | `discountAmount` 미전달 시 기존 enrollment의 할인금액 사용 |
| 결제 방법 전달 | `paymentMethod: 'card'` → 업데이트에 포함 |
| 결제 방법 미전달 | `paymentMethod: undefined` → 업데이트에서 제외 |
| 납부일 기본값 | `paidAt` 미전달 시 오늘 날짜 |

---

## Tier 2: 스토어 CRUD + 상태 관리 (Supabase mock 필요)

### 2-1. enrollmentStore — CRUD

**테스트 파일:** `src/stores/__tests__/enrollmentStore.test.ts` (1-3과 같은 파일)

| 테스트 케이스 | 설명 |
|-------------|------|
| `addEnrollment` | 새 enrollment 생성 → state에 추가, UUID 생성, discountAmount 기본값 0 |
| `updateEnrollment` | id로 찾아 부분 업데이트, 다른 항목 변경 없음 |
| `deleteEnrollment` | state에서 제거 |
| `getEnrollmentsByCourseId` | courseId 필터링 정확성 |
| `getEnrollmentsByStudentId` | studentId 필터링 정확성 |
| `getEnrollmentCountByCourseId` | 카운트 정확성 |

### 2-2. notificationStore — CRUD + localStorage

**테스트 파일:** `src/stores/__tests__/notificationStore.test.ts`

localStorage mock으로 persistence 테스트 가능.

| 테스트 케이스 | 설명 |
|-------------|------|
| `addNotification` | 새 알림 → 배열 앞에 추가, `isRead: false`, `id` 자동 생성 |
| `markAsRead` | 특정 알림 `isRead: true`, 다른 알림 변경 없음 |
| `markAllAsRead` | 전체 `isRead: true` |
| `deleteNotification` | 특정 알림 제거 |
| `clearAll` | 빈 배열 |
| `getUnreadCount` | 읽지 않은 알림 수 |
| `loadNotifications` | localStorage에서 복원 |
| `saveNotifications` | localStorage에 저장 |
| `loadNotifications` 파싱 실패 | 잘못된 JSON → 에러 무시, 기존 state 유지 |

### 2-3. lockStore — PIN 해싱 + 잠금

**테스트 파일:** `src/stores/__tests__/lockStore.test.ts`

Web Crypto API 사용하므로 Node 환경에서도 동작 (Node 18+).

| 테스트 케이스 | 설명 |
|-------------|------|
| `setPin` | PIN → SHA-256 해시로 저장 |
| `verifyPin` 성공 | 같은 PIN → true |
| `verifyPin` 실패 | 다른 PIN → false |
| `lock` | `isEnabled && pin` 있을 때 → `isLocked: true` |
| `lock` 비활성 | `isEnabled: false` → `isLocked` 변경 없음 |
| `unlock` 성공 | 올바른 PIN → `isLocked: false`, return true |
| `unlock` 실패 | 틀린 PIN → `isLocked: true` 유지, return false |
| `setEnabled(false)` | `isEnabled: false`, `isLocked: false` |
| `loadLockSettings` | localStorage에서 복원 |
| `saveLockSettings` | 변경 시 localStorage에 자동 저장 |

---

## Tier 3: 유틸리티 (단위 테스트)

### 3-1. logger

**파일:** `src/utils/logger.ts`
**테스트 파일:** `src/utils/__tests__/logger.test.ts`

| 테스트 케이스 | 설명 |
|-------------|------|
| `logDebug/Info/Warn/Error` | 올바른 콘솔 메서드 호출 |
| `startTimer` | `end()` 호출 시 경과 시간 로그 |
| Electron 환경 | `electron-log`로 포워딩 (mock) |

### 3-2. export (Excel/CSV)

**파일:** `src/utils/export.ts`
**테스트 파일:** `src/utils/__tests__/export.test.ts`

xlsx 라이브러리 의존. 생성된 시트 데이터 구조만 검증 (파일 다운로드는 mock).

| 테스트 케이스 | 설명 |
|-------------|------|
| `exportStudentsToExcel` | 학생 데이터 → 엑셀 시트 생성, 헤더 포함 |
| `exportStudentsToCSV` | 학생 데이터 → CSV 문자열, 한글 헤더 |
| `exportRevenueToExcel` | 매출 데이터 + 합계 행 포함 |
| 빈 데이터 | 빈 배열 → 헤더만 있는 시트/CSV |

---

## 테스트 제외 (현 단계)

| 대상 | 사유 |
|------|------|
| `authStore` | Supabase auth + Edge Function 연동이 깊어 통합 테스트 영역 |
| `licenseStore` | authStore 의존성 |
| `backupHandler.ts` (Electron) | Node fs/archiver 의존, E2E 테스트 영역 |
| React 컴포넌트 | `@testing-library/react` 설정 후 별도 진행 |
| Edge Functions | Supabase CLI 로컬 환경에서 통합 테스트 |

---

## 파일 구조

```
src/
  utils/
    __tests__/
      fieldMapper.test.ts     # Tier 1-1
      errors.test.ts          # Tier 1-2
      logger.test.ts          # Tier 3-1
      export.test.ts          # Tier 3-2
  stores/
    __tests__/
      enrollmentStore.test.ts # Tier 1-3 + 2-1
      notificationStore.test.ts # Tier 2-2
      lockStore.test.ts       # Tier 2-3
vitest.config.ts              # Vitest 설정
```

## Mock 전략

| 의존성 | Mock 방식 |
|--------|----------|
| Supabase client | `vi.mock('../utils/supabaseStorage')` — CRUD 함수 mock |
| `authStore.isCloud` | `vi.mock('./authStore', () => ({ isCloud: () => true }))` |
| `authStore.getOrgId` | `vi.mock('./authStore', () => ({ getOrgId: () => 'test-org-id' }))` |
| `localStorage` | `vitest` jsdom 환경에서 자동 제공 |
| `crypto.subtle` | Node 18+ 네이티브 지원, 별도 mock 불필요 |
| `crypto.randomUUID` | Node 네이티브 지원 |
| `nanoid` | mock 불필요 (실제 사용) |
| `dayjs` | mock 불필요 (실제 사용), 날짜 비교 시 `toISOString()` 패턴 매칭 |
| `antd` message/notification | `vi.mock('antd')` |
| `electron-log` | `vi.mock('electron-log')` |
| `xlsx` | 실제 사용 (시트 데이터 구조 검증) |

## 실행

```bash
npx vitest          # watch 모드
npx vitest run      # 1회 실행
npx vitest --coverage # 커버리지
```
