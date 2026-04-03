# TutorMate 테스트 전략 설계

## 개요

프로덕션 수준의 테스트 커버리지를 확보한다. 기능 정의서를 먼저 작성하고, 정의서 기반으로 테스트를 작성한 뒤, 코드를 테스트에 맞춰 정리한다. 수동 테스트 없이도 릴리즈 가능한 수준을 목표로 한다.

## 접근법: Bottom-Up + 기능 정의서 우선

각 모듈에 대해 이 순서를 따른다:

1. 기능 정의서 작성 (원하는 동작 정의)
2. 정의서 기반 테스트 작성
3. 테스트 통과하도록 코드 수정/리팩토링
4. 정의서에 없는 불필요한 분기 제거

순서: `utils` → `stores` → `UI 컴포넌트` → `E2E`

## 1. 테스트 인프라

### 1.1 로컬 Supabase

- `supabase init` + `supabase start`로 로컬 PostgreSQL + Auth 구동
- `supabase/migrations/`에 스키마 마이그레이션 관리 (프로덕션 Supabase 대시보드에서 현재 스키마를 export하거나 `supabase db pull`로 가져옴)
- `supabase/seed.sql`로 테스트용 시드 데이터 (과목, 학생, 등록, 결제 등)
- 전체 테스트 스위트 시작 시 1회 `supabase db reset` + seed

### 1.2 테스트 격리: 트랜잭션 롤백

- 각 테스트: `beforeEach`에서 `BEGIN`, `afterEach`에서 `ROLLBACK`
- 테스트 간 완전 격리, 밀리초 단위 속도
- `supabase db reset`은 전체 스위트 시작 시 한 번만 실행

### 1.3 Vitest Workspace

루트에 `vitest.workspace.ts` 하나로 모노레포 전체 통합:

- `packages/core`: node 환경, 로컬 Supabase 연동
- `packages/ui`: jsdom 환경, `@testing-library/react` + `@testing-library/user-event`
- `pnpm test` 한 번으로 전체 실행 + 통합 커버리지 리포트

### 1.4 커버리지

- `@vitest/coverage-v8`로 branch coverage 측정
- threshold: branches 95% (도달 불가능한 분기 허용 마진)
- `vitest run --coverage` 시 threshold 미달이면 실패 처리

## 2. 기능 정의서 형식

각 모듈에 대해 다음 구조로 정의서를 작성한다:

```markdown
# [모듈명] 기능 정의서

## 역할
- 이 모듈이 하는 일 한 줄 요약

## 입력 / 출력
- 받는 것, 반환하는 것 명확히

## 동작 규칙
- 규칙 1: ~할 때 ~한다
- 규칙 2: ~가 없으면 ~한다

## 에러 처리
- ~실패 시 ~를 반환/throw한다

## 하지 않는 것 (스코프 밖)
- 명시적으로 이 모듈이 책임지지 않는 것
```

원칙:
- 정의서에 없는 분기는 코드에서 제거 대상
- 정의서의 모든 규칙에는 대응하는 테스트가 있어야 함
- "하지 않는 것"을 명시해서 불필요한 방어 코드 방지

계층별 정의서 단위:
- utils: 함수 단위
- stores: store 단위
- UI 컴포넌트: 컴포넌트 단위

## 3. packages/core — utils 테스트

### 3.1 기존 보강 (7개)

| 파일 | 보강 포인트 |
|------|------------|
| `dataHelper.test.ts` | 캐시 만료, 동시 로드, 빈 데이터 분기 |
| `errors.test.ts` | 모든 에러 타입별 분기, 네트워크 에러 등 |
| `formatters.test.ts` | 빈 값, null, 잘못된 포맷 입력 |
| `notificationGenerator.test.ts` | 미납/연체 경계값, 빈 수강 목록 |
| `export.test.ts` | 빈 데이터 export, 특수문자 포함 데이터 |
| `fieldMapper.test.ts` | null 필드, 타입 불일치, 양방향 매핑 검증 |
| `logger.test.ts` | 로그 레벨별 분기, 비활성 상태 |

### 3.2 신규 작성 (4개)

| 파일 | 테스트 시나리오 |
|------|---------------|
| `quarterUtils.ts` | 분기 계산, 경계값 (1월/12월), 연도 전환 |
| `scheduleUtils.ts` | 수업 횟수 계산, 빈 스케줄, 공휴일 처리 |
| `search.ts` | 검색 키워드 매칭, 빈 쿼리, 특수문자, 한글 초성 |
| `supabaseStorage.ts` | CRUD 전체 분기, RLS 위반 케이스, 벌크 인서트 (로컬 Supabase 사용) |

### 3.3 테스트 작성 원칙

- 정의서의 모든 "동작 규칙"에 대해 정상/실패 테스트
- 경계값: 빈 배열, null, undefined, 0, 빈 문자열
- 에러 케이스는 정상 케이스만큼 상세하게

## 4. packages/core — stores 테스트

### 4.1 기존 보강 (9개)

| Store | 보강 포인트 |
|-------|------------|
| `authStore` (435줄) | OAuth 플로우 분기, trial 만료, 조직 전환, anonymous→cloud 전환, 에러 핸들링 |
| `courseStore` | CRUD 전 분기 + 삭제 시 연관 enrollment 처리, 중복 과목명 |
| `studentStore` | CRUD + 삭제 시 연관 데이터 cascade, 중복 학생 |
| `enrollmentStore` | 등록/해지 분기, 이미 등록된 학생 재등록, 만료된 수강 |
| `licenseStore` | 활성화/비활성화/검증 분기, 만료 라이선스, 잘못된 키, 기기 변경 |
| `lockStore` | 잠금/해제, 비밀번호 틀림, 자동잠금 타이머 |
| `monthlyPaymentStore` | 납부/미납 분기, 중복 납부, 월 경계값 |
| `notificationStore` | 추가/제거/읽음 처리, 빈 상태 |
| `settingsStore` | 각 설정 변경 분기, 잘못된 값 |

### 4.2 신규 작성 (1개)

| Store | 테스트 시나리오 |
|-------|---------------|
| `paymentRecordStore` (164줄) | CRUD 전 분기, 기간별 조회, 중복 납부, 환불 처리, 금액 경계값 |

### 4.3 hooks 테스트 (1개)

| Hook | 테스트 시나리오 |
|------|---------------|
| `useAutoLock` | 타이머 동작, 활동 감지 리셋, 설정 비활성 시 |

### 4.4 lib/oauth 테스트 (1개)

| 모듈 | 테스트 시나리오 |
|------|---------------|
| `deeplink.ts` | 딥링크 파싱, 잘못된 URL, 토큰 추출, 프로토콜 핸들링 |

### 4.5 테스트 방식

- 로컬 Supabase 연동 통합 테스트
- 각 테스트: `beforeEach` 트랜잭션 시작, `afterEach` 롤백
- Zustand store는 매 테스트마다 초기화 (`store.setState(initialState)`)
- 모든 public 메서드에 대해 성공/실패/엣지케이스 분기 전부 커버

## 5. packages/ui — React 컴포넌트 테스트

Vitest + React Testing Library + user-event.

### 5.1 폼 컴포넌트 (5개)

| 컴포넌트 | 테스트 시나리오 |
|----------|---------------|
| `StudentForm` | 신규/수정 모드 분기, 필수 필드 유효성, 전화번호 포맷팅, 납부 이력 표시, 제출 성공/실패 |
| `CourseForm` | 신규/수정 모드, 스케줄 입력, 수강료 입력 검증, 중복 과목명 경고 |
| `EnrollmentForm` | 과목/학생 선택, 이미 등록된 조합 방지, 시작일 검증 |
| `PaymentForm` | 금액 입력 검증, 납부 방법 선택 분기, 날짜 선택 |
| `BulkPaymentForm` | 다건 선택/해제, 전체 선택, 빈 목록, 일괄 처리 |

### 5.2 테이블/리스트 컴포넌트 (4개)

| 컴포넌트 | 테스트 시나리오 |
|----------|---------------|
| `StudentList` | 빈 목록, 검색 필터링, 정렬, 페이지네이션, 삭제 확인 모달 |
| `CourseList` | 빈 목록, 필터링, 과목 클릭 네비게이션 |
| `MonthlyPaymentTable` | 월별 표시, 납부/미납 상태 토글, 빈 데이터 |
| `PaymentManagementTable` | 기간 필터, 상태별 필터, 정렬 |

### 5.3 차트 컴포넌트 (3개)

| 컴포넌트 | 테스트 시나리오 |
|----------|---------------|
| `CourseRevenueChart` | 데이터 있을 때/없을 때, 차트 렌더링 확인 |
| `PaymentStatusChart` | 납부율 표시, 빈 데이터 |
| `MonthlyRevenueChart` | 월별 데이터, 빈 데이터 |

### 5.4 공통/레이아웃 컴포넌트 (10개)

| 컴포넌트 | 테스트 시나리오 |
|----------|---------------|
| `Layout` | 사이드바 토글, 반응형 분기 |
| `Navigation` | 메뉴 활성 상태, 라우트 전환 |
| `ErrorBoundary` | 에러 발생 시 fallback 렌더링, 정상 시 children 렌더링 |
| `LockScreen` | 비밀번호 입력, 틀림/맞음 분기, 잠금 상태 표시 |
| `LicenseKeyInput` | 키 입력 포맷팅, 유효/무효 키, 활성화 성공/실패 |
| `UpdateChecker` | 업데이트 있음/없음/에러 분기, 다운로드 진행 |
| `GlobalSearch` | 검색 입력, 결과 표시, 빈 결과, 카테고리별 필터 |
| `NotificationCenter` | 알림 목록, 읽음 처리, 빈 상태 |
| `AdminTab` | 설정 변경, 저장 성공/실패 |
| `AutoBackupScheduler` | 스케줄 설정, 활성/비활성 토글 |

### 5.5 테스트 방식

- Store는 실제 Zustand store 사용 (테스트마다 초기화)
- Supabase 호출하는 store 액션은 로컬 Supabase 연동
- Ant Design 컴포넌트 (Modal, message 등)는 테스트 setup에서 처리
- `user-event`로 실제 사용자 인터랙션 시뮬레이션

## 6. E2E 시나리오 확장 (Playwright)

기존 5개 E2E 파일을 보강. 모듈 간 연결 플로우에 집중.

### 6.1 커버할 유저 플로우

| 플로우 | 시나리오 |
|--------|---------|
| 인증 | 로그인 → 조직 선택 → 메인 진입, 잘못된 인증 시 에러 |
| 과목 관리 | 과목 생성 → 수정 → 삭제, 스케줄 설정 |
| 학생 관리 | 학생 등록 → 수정 → 삭제, 검색 |
| 수강 등록 | 학생-과목 연결 → 해지, 중복 등록 방지 |
| 결제 | 납부 기록 → 수정 → 조회, 일괄 납부 |
| 설정 | 테마 변경, 잠금 설정/해제 |
| 라이선스 | 키 입력 → 활성화 → 만료 처리 |

### 6.2 E2E 테스트 원칙

- 유닛/컴포넌트에서 이미 커버한 세부 분기는 E2E에서 반복하지 않음
- E2E는 모듈 간 연결이 잘 되는지에 집중 (학생 등록 → 수강 → 결제까지 이어지는 흐름)
- 각 플로우는 독립적으로 실행 가능 (테스트 간 의존성 없음)

## 7. 릴리즈 스크립트 통합

### 7.1 커맨드

`pnpm release:mac` / `pnpm release:win`

### 7.2 실행 흐름

```
pnpm release:mac / pnpm release:win
        │
        ├─ 1. supabase db reset (로컬 DB 초기화)
        ├─ 2. vitest run --coverage (threshold 미달 시 중단)
        ├─ 3. playwright test (E2E 실패 시 중단)
        ├─ 4. 버전 확인 (package.json version 출력)
        └─ 5. electron:build (빌드)
```

- 어느 단계든 실패하면 즉시 중단, 빌드 안 됨
- Q 버전도 동일: `pnpm release:q:mac` / `pnpm release:q:win`

## 8. 전체 실행 순서

1. 테스트 인프라 구성 (Vitest Workspace, 로컬 Supabase, 트랜잭션 헬퍼)
2. utils 기능 정의서 → 테스트 → 코드 정리
3. stores 기능 정의서 → 테스트 → 코드 정리
4. UI 컴포넌트 기능 정의서 → 테스트 → 코드 정리
5. E2E 시나리오 확장
6. 릴리즈 스크립트 통합
7. 전체 커버리지 확인 및 최종 검증

## 제외 대상

- `backupHelper.ts` — 사용 중단 예정
- `useBackup` hook — 사용 중단 예정
