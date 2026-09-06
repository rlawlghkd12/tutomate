# PLAN — AI 임포트 처리 내역 & 개별 되돌리기

> 상태: 계획(승인 대기) · 작성일: 2026-09-06 · 대상 브랜치: `feat/ai-import-core`
> 문서 동기화: local (`docs/`)

## 1. 배경 & 목표

AI 어시스턴트로 엑셀/은행 거래내역을 임포트하면 **돈(결제·수강 등록)이 실제로 저장**된다.
그러나 현재는:

- 처리 후 **개수만** 보여준다 (`추가 N건 · 중복 N건`). 누가·어느 강좌·얼마인지 개별 내역이 없다.
- **AI 저장 경로가 감사 로그(event log)를 남기지 않는다** — 수동 납부는 남기는데 AI 임포트는 추적이 안 됨.
- 저장된 기록 ID가 UI로 전달되지 않아 **개별 되돌리기가 불가능**하다.

**목표:** AI가 처리한 모든 건을 (1) 내역으로 투명하게 보여주고, (2) 감사 로그로 추적 가능하게 하며, (3) 개별/일괄로 안전하게 되돌릴 수 있게 한다.

### 성공 기준 (요약)
- 임포트 직후 결과 카드에서 **저장된 각 건**(이름·강좌·금액·날짜·종류)을 볼 수 있다.
- 각 건 옆 **[되돌리기]** 로 그 건만 취소 → 납부 기록 삭제 + 잔액 재동기화.
- **[이번 임포트 전체 되돌리기]** 로 배치 전체 취소.
- 신규 강좌 등록으로 생성된 건은 **등록까지 지울지 확인** 후 처리.
- 모든 저장/되돌리기가 **이벤트 로그**에 남아 나중에도 조회 가능.

## 2. 범위 (단계)

| 단계 | 내용 | 위험 | 우선 |
|---|---|---|---|
| **P1 감사 로그** | AI 저장 시 각 건을 `logEvent`로 기록 + `importBatchId`로 묶기 | 낮음 | ★ |
| **P2 개별 내역 카드** | 결과 카드에 저장된 건 목록 표시(이름·강좌·금액·종류) | 낮음 | ★ |
| **P3 개별 되돌리기** | 각 건 [되돌리기] → 기록 삭제 + 잔액 재동기화 (+ 신규 등록 정리 확인) | 중간(돈 삭제) | |
| **P4 배치 전체 되돌리기** | 이번 임포트 전체 취소 | 중간 | |

**권장 진행:** P1+P2 먼저(투명성, 저위험) → 검증 후 P3 → P4.

## 3. 아키텍처 & 모듈화

원칙: **결정론 순수 로직은 core에, DB 부수효과는 tool/store에, 화면은 앱 ai-chat 컴포넌트에.** 돈 삭제는 항상 사용자 확인 후.

```
[UI] apps/*/src/pages/ai-chat/components/SmartCard/*      ← 내역 표시 + 되돌리기 버튼
        │ (ai:dispatch IPC)
[IPC] packages/electron-shared/src/ipc/aiHandler.ts        ← 기존 dispatch 라우팅 재사용
        │
[Tool] packages/core/src/ai/tools/{confirmImport,confirmBankDeposits,undoImport}.ts
        │  ← 저장/삭제 실행 + 감사 로그 emit (RLS org 가드)
[Pure] packages/core/src/ai/import/{importAudit,undoPlan}.ts
           ← 로그 엔트리 생성 / 되돌리기 계획 = 순수 함수(단위테스트)
```

### 3.1 신규 파일 (core, 순수)
- **`packages/core/src/ai/import/importAudit.ts`**
  - `SavedItem` 모델: `{ recordId, enrollmentId, studentName, courseName, amount, paidAt, kind: 'saved'|'enrolled'|'refunded', newEnrollmentId?: string }`
  - `buildImportLogEntries(items: SavedItem[], batchId: string, source: 'excel'|'bank'): LogEventArgs[]` — 순수. 각 건을 `payment.import_add` 이벤트로.
- **`packages/core/src/ai/import/undoPlan.ts`**
  - `planUndo(targets: UndoTarget[], state: UndoState): UndoVerdict[]` — 각 건을 delete/deleteWithEnrollment/warn/skip/blocked로 분류 (§3.6 매트릭스).
  - 입력 `state`: 현재 record 존재/금액·날짜, 등록별 기록 수, 환불 존재, enrollment 상태(withdrawn/exempt), 임포트 스냅샷.
  - 순수 → 모든 경우의 수를 테스트로 고정. 실제 삭제·재검증은 tool이 수행.

### 3.2 신규 파일 (core, tool)
- **`packages/core/src/ai/tools/undoImport.ts`**
  - 입력: `{ recordIds: string[], enrollmentIdsToDelete?: string[] }` (또는 `batchId`)
  - RLS org 가드로 현재 조직 기록만 삭제, `payment_records` 삭제 → 영향 enrollment 재동기화(`computeEnrollmentSync`) → 필요 시 빈 enrollment 삭제.
  - 각 삭제를 `payment.import_undo` 로그로 남김. 반환: `{ undone, failed }`.
  - `ai:dispatch` 카탈로그에 등록.

### 3.3 수정 파일 (core)
- **`confirmImport.ts` / `confirmBankDeposits.ts`**
  - `.insert(...).select('id')` 결과로 **`SavedItem[]` 구성** → 반환값 + 결과 카드에 포함.
  - `importBatchId`(uuid) 생성해 각 건과 로그에 부착.
  - `buildImportLogEntries(...)` 로 감사 로그 emit (best-effort, 실패해도 저장은 유지).
- **`packages/core/src/ai/types.ts`**
  - `importResult` / `bankDepositResult`에 `batchId?: string`, `savedItems?: SavedItem[]` 추가.
  - 신규 카드 `importUndoResult`: `{ type, undone, failed }`.
- **`packages/core/src/ai/index.ts`** — `undoImport` export/등록.

### 3.4 UI (앱 ai-chat, 양 앱 동일 파일 → 복사)
- **`SmartCard/ImportResultCard.tsx`**, **`SmartCard/BankDepositResultCard.tsx`**
  - 개수 요약 아래 **저장 건 목록**(이름 · 강좌 · 금액 · 종류 배지).
  - 각 줄 **[되돌리기]**, 하단 **[이번 임포트 전체 되돌리기]**.
  - 되돌리기 클릭 → **AlertDialog 확인** → `ai:dispatch({toolName:'undoImport', ...})` → 성공 시 그 줄 "취소됨" 표시.
  - 신규 등록 건이면 확인 문구에 "등록도 함께 삭제됩니다" 표기.
- **`MessageBubble.tsx`** — 새 `importUndoResult` 카드 렌더 분기.
- 되돌리기 콜백은 기존 `DirectImportFallback`/`aiChatStore`의 dispatch 경로와 동일하게 배선.

### 3.5 데이터 모델
- **스키마 변경 없음.** 기존 `payment_records` 삭제 + `event_logs` 기록으로 충분.
- `importBatchId`는 event_logs.meta에만 저장(별도 컬럼 불필요) → 로그 화면에서 배치로 묶어 조회.
- 각 로그 meta에 **임포트 시점 스냅샷**(amount·paidAt) 저장 → 나중에 "임포트 후 수정 여부" 비교에 사용.

### 3.6 되돌리기 정합성 모델 (핵심)

**원칙: 되돌리기는 "그때 로그"를 맹신하지 않고, 실행 직전 현재 DB 상태를 다시 검사한다.**
`planUndo`는 순수 함수로 각 건을 **허용 / 경고 후 허용 / 차단 / 무동작**으로 분류한다.

```ts
type UndoVerdict =
  | { recordId; action: 'delete' }                        // 정상
  | { recordId; action: 'deleteWithEnrollment'; enrollmentId } // 신규등록 + 유일 기록
  | { recordId; action: 'warn'; reason }                  // 확인 후 진행
  | { recordId; action: 'skip'; reason }                  // 이미 취소됨 등 무동작
  | { recordId; action: 'blocked'; reason };              // 막음
```

**경우의 수 (Undo Safety Matrix)**

| 상황 | 판정 | 사용자에게 |
|---|---|---|
| 임포트 그대로 존재 | `delete` | 바로 되돌림 |
| 임포트 후 **금액/날짜가 수정됨** (스냅샷≠현재) | `warn` | "임포트 후 수정된 기록입니다. 삭제하면 수정분도 사라져요" → 확인 |
| **이미 삭제됨**(수동 등) | `skip` | "이미 취소됨" 표시, 무동작 |
| 신규 등록 + 이후 **다른 결제 추가됨** | `delete` (등록 유지) | 그 기록만 삭제, 등록은 남김 |
| 신규 등록 + 그 기록이 **유일** | `deleteWithEnrollment` | "새로 만든 수강 등록도 함께 삭제됩니다" → 확인 |
| **환불이 이미 걸린** 등록 (삭제 시 합계 음수) | `blocked` | "환불 기록이 있어 되돌릴 수 없어요. 먼저 환불을 정리하세요" |
| 이후 **포기/면제로 전환됨** | `delete` + 상태 보존 재동기화 | 기록만 삭제, withdrawn/exempt 유지 |
| 배치 전체 중 **일부 이미 되돌림** | 나머지만 `delete`, 된 건 `skip` | "N건 취소, M건은 이미 취소됨" |
| **지난 분기/마감 처리**(마감 개념 도입 시) | `blocked` | "마감된 분기라 되돌릴 수 없어요" |
| 이중 클릭(동시 되돌리기) | 2번째 `skip` | 버튼 busy + 서버 재검사 |

- `warn`/`blocked` 사유는 카드·모달에 그대로 노출.
- `undoImport` tool은 planUndo 판정을 **서버에서 다시 검증**(클라이언트 우회 방지) 후 실제 삭제.
- 되돌리기 결과도 건별 집계: `{ undone, skipped, blocked, failed }`.

## 4. UI 구성 & 배치

### 4.1 결과 카드 (채팅 내)
```
┌────────────────────────────────────────────┐
│ ✅ 입금 5건 저장 완료   (새 등록 2 · 환불 1)   │
│ ─────────────────────────────────────────── │
│ 홍길동   · 태극권   150,000  [저장]   [되돌리기]│
│ 김영희   · 합창     120,000  [새 등록] [되돌리기]│
│ 박철수   · 드럼      80,000  [환불]   [되돌리기]│
│ … 더보기 (외 2건)                             │
│ ─────────────────────────────────────────── │
│ 이미 저장돼 건너뜀 1건 · 미매칭 1건            │
│ [ 이번 임포트 전체 되돌리기 ]                  │
└────────────────────────────────────────────┘
```
- 종류 배지 색: 저장(초록)·새 등록(파랑)·환불(주황).
- 되돌린 줄은 취소선 + "취소됨" 배지, 버튼 비활성.

### 4.2 확인 모달
- 개별: "홍길동 태극권 150,000원 납부를 되돌릴까요? 납부 기록이 삭제됩니다."
- 신규 등록: "…되돌리면 새로 만든 **태극권 수강 등록**도 함께 삭제됩니다."
- 전체: "이번에 저장한 5건을 모두 되돌릴까요?"

### 4.3 이벤트 로그 화면 (기존)
- `payment.import_add` / `payment.import_undo` 이벤트 라벨·아이콘 추가.
- 배치(`importBatchId`)로 묶어 "AI 임포트 5건"처럼 그룹 표시(선택).

## 5. 구현 로드맵

### Phase 1 — 감사 로그 + SavedItem (저위험)
1. `importAudit.ts` (SavedItem, buildImportLogEntries) + 단위테스트
2. `confirmImport`/`confirmBankDeposits`에서 SavedItem 구성 + batchId + 로그 emit
3. `types.ts`에 batchId·savedItems 필드 추가
4. 반환값/카드에 savedItems 전달 (표시는 P2)

### Phase 2 — 개별 내역 표시 (저위험)
5. `ImportResultCard`·`BankDepositResultCard`에 목록 렌더 (버튼 없이 표시만)
6. 양 앱 복사, tsc/테스트

### Phase 3 — 개별 되돌리기 (중위험, 돈 삭제)
7. `undoPlan.ts` (planUndo) + 단위테스트
8. `undoImport.ts` tool + dispatch 등록 (RLS 가드, 재동기화, 로그)
9. 카드에 [되돌리기] + AlertDialog + dispatch 배선 + `importUndoResult` 카드
10. 신규 등록 정리 확인 흐름

### Phase 4 — 배치 전체 되돌리기
11. [전체 되돌리기] → savedItems 일괄 undoImport (건별 verdict 집계)

### Phase 5 — 나중에 되돌리기 (이벤트 로그에서)
12. 이벤트 로그 화면에 AI 임포트 이벤트 라벨/배치 그룹핑
13. 로그 항목(또는 배치)에서 [되돌리기] → 저장된 recordId로 `undoImport` 호출
14. 실행 시점 현재 상태로 planUndo 재검사 → 정합성 깨지는 건 차단/경고 (§3.6)

## 6. 테스트 전략
- **순수 함수 단위테스트**(필수): `buildImportLogEntries`, `planUndo` (신규 등록 정리·환불·중복 경계).
- **tool 통합테스트**: `undoImport` — org 밖 id 거부, 삭제 후 재동기화 값, 빈 등록 삭제 여부 (mock supabase).
- **tsc 게이트**: `npx tsc -b apps/tutomate apps/tutomate-q` exit 0.
- **실기기 E2E(필수)**: 저장→개별 되돌리기→잔액 확인, 신규 등록 되돌리기, 전체 되돌리기. *(헤드리스 검증 불가 구간)*

## 7. 리스크 & 대응
- **돈 삭제의 비가역성** → 항상 사용자 확인 모달 + 되돌리기도 로그로 추적.
- **되돌리기 부분 실패**(N건 중 일부) → 건별 성공/실패 집계 보고(‘저장 실패 정확히 보고’ 패턴 재사용).
- **신규 등록 삭제 시 다른 기록 존재** → 그 등록에 다른 결제가 있으면 등록은 남기고 기록만 삭제.
- **RLS/조직 격리** → undoImport도 현재 org 기록만 (기존 가드 패턴 재사용).
- **헤드리스 검증 한계** → 실기기 테스트를 완료 조건으로 명시.

## Template Foundation
- 해당 없음 — 기존 Electron 모노레포에 기능 추가(제로베이스/기존 코드 수정). 프론트/백엔드 템플릿 미사용.

## 부속 문서
- `docs/REQUIREMENTS-ai-import-history-undo.md`
- `docs/RISKS-ai-import-history-undo.md`
