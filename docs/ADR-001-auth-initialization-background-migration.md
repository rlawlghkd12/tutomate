# ADR-001: Auth 초기화 비동기화 및 마이그레이션 1회 실행 보장

**Status:** Accepted
**Date:** 2026-03-14
**Deciders:** jrbr (TutorMate maintainer)

## Context

TutorMate v0.3.0 → v0.3.1 핫픽스 과정에서 다음 문제들이 발견되었다.

**문제 1: 앱 시작 시 PIN 잠금 화면 멈춤**

`authStore.initialize()`가 네트워크 요청(Supabase 세션, 조직 조회)과 무거운 I/O 작업(로컬 백업 ZIP 생성, 데이터 스냅샷, DB 업로드, monthly_payments 복원)을 모두 완료할 때까지 `loading: true` 상태를 유지했다. `App.tsx`는 `authLoading`이 `false`가 될 때까지 Spinner만 표시했으므로, PIN 잠금 화면(`LockScreen`)도 렌더링되지 않았다. 네트워크 지연이나 대용량 백업 시 사용자는 수 초간 앱이 멈춘 것으로 인식했다.

**문제 2: 마이그레이션이 매 앱 시작마다 반복 실행**

로컬→클라우드 마이그레이션(`silentLocalBackup`, `getLocalDataSnapshot`, `clearLocalData`, `restoreMonthlyPaymentsFromBackup`)이 앱을 시작할 때마다 실행되어 불필요한 네트워크 트래픽과 I/O가 발생했다. 이미 마이그레이션이 완료된 사용자도 매번 동일한 작업을 반복했다.

**문제 3: 기존 조직 재연결 시 데이터 삭제 위험**

`create-trial-org` Edge Function이 `isNewOrg=false`(기존 org 재연결)를 반환했을 때, `migrateLocalToCloud()`가 실행되면 해당 함수 내부에서 Supabase의 기존 데이터를 전부 DELETE한 후 빈 로컬 데이터를 INSERT하는 치명적 데이터 손실이 발생할 수 있었다.

## Decision

### 1. UI 우선 해제 — 무거운 작업은 백그라운드로

`authStore.initialize()`에서 세션 확인 + 조직 조회가 완료되면 즉시 `loading: false`를 설정하여 UI를 해제한다. 백업, 스냅샷, 마이그레이션 등 무거운 작업은 `setTimeout(..., 100)`으로 비동기 실행한다.

### 2. LockScreen 렌더링 우선순위

`App.tsx`에서 `isLocked && lockEnabled` 조건을 `authLoading` 체크보다 먼저 배치하여, 인증 초기화와 무관하게 PIN 잠금 화면을 즉시 표시한다.

### 3. localStorage 플래그로 1회 실행 보장

`migration-done-{orgId}` 키를 localStorage에 저장하여 조직별로 마이그레이션 완료 상태를 추적한다. 플래그가 존재하면 백그라운드 마이그레이션을 완전히 건너뛴다. 실패 시 플래그를 설정하지 않아 다음 앱 시작에 자동 재시도한다.

### 4. isNewOrg 가드로 데이터 보호

Trial 경로에서 `isNewOrg=true`인 경우에만 `migrateLocalToCloud()`를 실행한다. `isNewOrg=false`(기존 org 재연결)인 경우에는 로컬 데이터 정리만 수행하고 Supabase 데이터는 건드리지 않는다.

## Options Considered

### Option A: 현재 방식 — setTimeout + localStorage 플래그 (채택)

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low |
| Reliability | Medium — localStorage는 사용자가 삭제할 수 있음 |
| Side Effects | Minimal — 기존 코드 구조 유지 |
| Migration Safety | High — 플래그 없으면 재실행, 있으면 스킵 |

**Pros:** 구현이 간단하고 기존 코드 변경 최소화. `restoreMonthlyPaymentsFromBackup()`은 자체 멱등성 보장(count > 0 → skip). 플래그 삭제 시에도 licensed user 경로는 마이그레이션 없이 로컬 클리어만 수행하므로 안전.

**Cons:** localStorage 의존으로 브라우저 데이터 삭제 시 플래그 소실. 단, 소실 시에도 `hasLocalData()=false`이면 실질적 작업 없음.

### Option B: Supabase metadata 테이블에 마이그레이션 상태 저장

| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium — 테이블 스키마 변경 필요 |
| Reliability | High — 서버사이드 영속 |
| Side Effects | Medium — DB 마이그레이션 필요 |
| Migration Safety | High |

**Pros:** localStorage보다 신뢰성 높음. 다중 기기에서도 일관된 상태.

**Cons:** organizations 테이블에 컬럼 추가 또는 별도 테이블 생성 필요. 현재 핫픽스 긴급도에 비해 과도한 변경. 추후 백업 기능 제거 예정이므로 투자 대비 효용 낮음.

### Option C: 마이그레이션 로직 자체를 멱등하게 리팩토링

| Dimension | Assessment |
|-----------|------------|
| Complexity | High — migrateLocalToCloud() 전면 재작성 |
| Reliability | High |
| Side Effects | High — 테스트 범위 확대 필요 |
| Migration Safety | High |

**Pros:** 근본적 해결. 몇 번 실행해도 동일 결과.

**Cons:** `migrateLocalToCloud()`가 UUID 재생성 + DELETE-INSERT 방식이라 멱등화가 어려움. UPSERT로 전환하면 ID 충돌 관리가 복잡해짐. 핫픽스로 적합하지 않음.

## Trade-off Analysis

Option A는 핫픽스 긴급도에 적합한 최소 변경이다. localStorage 플래그 소실 시 재실행되지만, `hasLocalData()=false`(마이그레이션 후 로컬 파일은 이미 `[]`)이므로 실질적 부작용 없다. Licensed user 경로는 아예 `migrateLocalToCloud()`를 호출하지 않고, trial user의 `isNewOrg=false` 경로도 마이그레이션 없이 로컬 클리어만 수행한다.

Option B/C는 장기적으로 더 견고하지만, 백업 기능 자체를 제거할 예정이므로 투자 대비 효용이 낮다.

## Consequences

- 앱 시작 시 PIN 잠금 화면이 즉시 표시되어 UX 개선
- 마이그레이션이 org당 1회만 실행되어 불필요한 네트워크/IO 제거
- `isNewOrg=false` 시 기존 Supabase 데이터가 보호됨
- localStorage 플래그에 의존하므로 사용자가 브라우저 데이터 삭제 시 재실행 가능 (안전하게 noop)
- `setTimeout` 내부 에러가 전역 에러 핸들러로 잡히지 않으므로 logWarn으로만 기록됨
- 추후 백업 시스템을 Supabase 기반으로 전환하거나 제거할 때 이 마이그레이션 코드도 함께 정리 필요

## Action Items

1. [x] `authStore.ts` — `loading: false`를 세션+조직 확인 직후로 이동, 무거운 작업 `setTimeout`으로 분리
2. [x] `authStore.ts` — `migration-done-{orgId}` localStorage 플래그 추가
3. [x] `authStore.ts` — Trial 경로에 `isNewOrg` 가드 추가
4. [x] `App.tsx` — LockScreen 렌더링을 authLoading 체크보다 우선 배치
5. [ ] activate-license Edge Function EarlyDrop 크래시 해결
6. [ ] v0.3.1 릴리스 및 배포
