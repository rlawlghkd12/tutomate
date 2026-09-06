# PLAN — AI 엑셀 결제 임포트 근본 개선 (LLM-forward, OpenRouter)

> ## ⚠️ 최종 정정 (2026-09-03) — LLM-forward는 채택되지 않음
> 구현·검토 결과 **파싱·매칭·중복·기간해석 전부 결정론으로 충분**하여 임포트에서 **LLM을 전면 제거**했다.
> 이 문서(§3~§8의 LLM-forward 서술, 4스테이지, modelRouter)와 `MODELS-*`·`PII-COST-*`는 **설계 이력**이다.
> 현행 아키텍처·구현 상태의 단일 진실은 **`docs/DEV-ai-payment-import.md`**(상단 정정 참조). FR-1~6의 요구사항 자체는 유효하며 결정론으로 전부 충족.

> 작성일: 2026-09-01 · 대상: TutorMate (`apps/tutomate`, `apps/tutomate-q`, `packages/core`)
> 문서 동기화: local (`docs/`)
> **정책 전환(2026-09-01):** 로컬(4B) 모델 폐기 → **모든 AI 호출은 OpenRouter 경유**. 저가 모델을 적극 활용하되, 돈이 바뀌는 결정에는 안전 레일을 둔다.
> **짝문서:** PII 전송 범위·마스킹·예상 비용·PIPA 체크리스트 → `docs/PII-COST-ai-payment-import.md`
> **개발 설계서:** 파일구조·함수 시그니처·LLM 프롬프트·JSON 스키마·알고리즘·테스트 → `docs/DEV-ai-payment-import.md`
> **모델 선정:** T0/T1/T2 모델·가격·근거·A/B 계획 → `docs/MODELS-ai-payment-import.md`

## 0. 한 줄 요약

"AI로 엑셀을 읽어 결제를 넣는" 기능은 현재 **성숙한 은행 흐름(B)** 과 **빈약한 일반 흐름(A)** 으로 이원화돼 있고, 은행 흐름조차 중복 판정에 결함이 있다. 이번 개선은 파싱·매칭·중복·저장을 **공통 코어로 통합**하고, 그 위에 **OpenRouter LLM을 "읽기·해석·후보판정" 계층으로 적극 도입**한다. 단, **돈이 바뀌는 결정(저장·중복확정)은 결정론 규칙 + 사용자 확인이 최종 판단**한다(LLM 단독 자동저장 금지).

## 1. 배경 — 현재 구조와 문제

| 항목 | 은행 흐름 (B, 성숙) | 일반 흐름 (A, 빈약) |
|---|---|---|
| 헤더 탐지 | 자동 탐지 (`parseBankExcel.ts`) | **1행 고정** (`ExcelParser.ts`) |
| 시트 | 헤더 스캔 | **첫 시트만** |
| CSV/인코딩 | — | **EUC-KR 처리 없음** |
| 매칭 | 강좌명 역탐지 + 오타보정 + 분기 스코프 (`depositMatcher.ts`) | **phone 완전일치만** (`confirmImport.ts`) |
| 기존 결제 중복방지 | 정확일치 + 월단위(paid_at) 2중 감지 — **분기/완납 미인지** ⚠️ | **전혀 없음** ← 재업로드 시 중복 저장 |
| 개별 행 제외 UI | 건별/전체 skip (`BankDepositPreviewCard.tsx`) | **없음(전량 확정/취소만)** |
| enrollment 동기화 | 있음 | **없음** (수익 페이지 미반영) |
| LLM 활용 | 대화 오케스트레이션 위주 | 컬럼 매핑도 키워드 휴리스틱 |

핵심 파일:
- 파싱: `packages/core/src/excel/ExcelParser.ts`, `packages/core/src/ai/bank/parseBankExcel.ts`
- 매칭 엔진: `packages/core/src/ai/bank/depositMatcher.ts` (참조 구현)
- 일반 툴: `packages/core/src/ai/tools/{parseExcelHeaders,mapColumns,previewImport,confirmImport}.ts`
- 오케스트레이션: `packages/electron-shared/src/ipc/aiHandler.ts`
- UI 카드: `apps/*/src/pages/ai-chat/components/SmartCard/{ImportPreviewCard,BankDepositPreviewCard}.tsx`

### 사용자 요청 → 결함 매핑
1. **"잘 읽고"** → 1행 헤더 고정 / 단일 시트 / CSV 인코딩 미처리 → 파싱 실패·누락. 컬럼명이 특이하면(성함/입금액/받은날/영문/병합셀) 키워드 매핑도 실패.
2. **"중복데이터 걸러내고"** → 일반 흐름은 중복 검사 **전무**. 은행 흐름도 **paid_at(납부 날짜)의 달** 기준이라 결함(아래).
3. **"UI로도 불필요한거 걸러내게"** → 일반 미리보기에 행 선택/제외 없음(전량만).

> **중복 판정 근본 결함 (조사 확인)** — 현행은 `enrollment|paid_at|amount`(정확) + `enrollment|YYYY-MM(paid_at)|amount`(월) 두 키뿐. 즉 **"언제 냈나"** 기준이라:
> - ❌ **정탐 실패**: 같은 분기를 다른 달에 두 번 내면 못 잡음.
> - ❌ **완납 무시**: 저장 전 enrollment 완납/`paid_amount`를 안 봄 → 완납 건에 또 입금돼도 추가.
> - ❌ **오탐 위험**: 다른 분기지만 같은 달·금액이면 중복 오판.
> → 판정 단위를 **"대상 수강 건(학생+강좌+분기) + 완납/초과"** 로 교체(FR-3).

## 2. 목표 / 범위

### In scope
- 일반 흐름(A)의 파싱·매칭·중복방지·UI를 은행 흐름(B) 이상으로 끌어올림
- 파싱/매칭/중복/저장 로직을 `packages/core` 공통 레이어로 통합
- **OpenRouter LLM 계층 도입**: 구조 파악·행 분류·매칭 후보 판정·메모 해석
- **모델 라우터**(작업별 저가↔상위 티어 + 폴백) 신설
- 미리보기 카드에서 **행 단위 포함/제외 + 제외 사유(+AI 신뢰도) 표시**

### Out of scope
- 저장 트랜잭션 원자성(별도 사이클, Risk 기록)
- 두 앱 UI 코드 전면 통합(공통 패키지화)
- 새 결제수단/스키마 변경
- **로컬 모델 지원**(폐기 확정 — OpenRouter만)

## 3. LLM 활용 전략 (핵심)

**대원칙: LLM은 "제안", 결정론+사용자는 "처분".** LLM은 애매함을 잘 해석하지만 환각 가능성이 있으므로, **돈이 바뀌는 쓰기(저장)와 중복 확정은 절대 LLM 단독으로 하지 않는다.** LLM 결과는 항상 (a) 결정론 규칙으로 교차검증되거나, (b) 신뢰도 임계값 미달 시 `needsConfirm`으로 UI 확인을 거친다.

### 3.1 LLM이 맡는 일 (제안 계층)
| 역할 | 설명 | 기본 티어 |
|---|---|---|
| **구조 파악 (StructureLLM)** | 시트/헤더행 위치, 컬럼→표준필드(name/phone/amount/date/course/memo) 매핑, 인코딩·병합셀 판단. 상위 N행 샘플만 전달 | T0 (초저가) |
| **행 분류·정제 (RowClassifyLLM)** | 각 행을 결제/합계/소계/헤더반복/메모/환불/비결제로 분류, 필드 정규화(금액·날짜·이름). 배치 처리 | T0 (초저가) |
| **매칭 후보 판정 (MatchAdjudicatorLLM)** | 결정론 프리필터가 좁힌 **top-K 후보** 중 최적 학생/강좌/enrollment 선택 or "없음". 동명이인·강좌 애매·오타 케이스만 | T1 (중가) |
| **메모→기간 해석 (IntentLLM)** | 입금 메모("7월분", "여름학기", "3개월") → 대상 분기/개월 추론. 결정론 중복판정에 입력 | T1 (중가) |

### 3.2 결정론이 맡는 일 (처분 계층 — LLM 불가침)
- **중복/완납/초과 판정(FR-3)**: 순수 함수. 돈 안전성 직결 → LLM에 위임 금지(메모 해석 힌트만 입력받음).
- **매칭 프리필터**: phone 완전일치·정규화·editDistance로 후보 축소(비용·환각 감소).
- **저장 게이트**: `auto`가 아니면 자동저장 금지. 신뢰도<임계 → `needsConfirm`.

### 3.3 모델 라우팅 (OpenRouter)
- 신규 `packages/core/src/ai/modelRouter.ts`: 작업 → `{primary, fallback[]}` 모델 매핑. 저가 기본, 실패/저신뢰만 상위 에스컬레이션.
- **T0**: 초저가 대량용(구조·행분류) · **T1**: 중가 판정용(매칭·의도) · **T2**: 상위, T1 저신뢰 잔여의 소수 에스컬레이션(선택).
- 모델 ID는 설정에서 교체 가능(하드코딩 금지) — OpenRouter 라우팅으로 특정 벤더 종속 회피.

### 3.4 비용·신뢰성 가드
- **구조화 출력 강제**: 모든 LLM 호출은 JSON 스키마(function/tool 형식) + 검증 + 재시도. 자유서술 파싱 금지.
- **배치**: 행 분류·정규화는 다건을 한 호출에 묶어 토큰/요청 절감.
- **캐시(멱등)**: 입력 콘텐츠 해시로 LLM 결과 캐시 → 재업로드·재시도 시 재과금 방지.
- **최소 전송**: 전체 시트가 아니라 스키마+샘플·후보만 전달(토큰·PII 최소화, 인젝션 방어).
- **인젝션 방어**: 시트 내용은 **데이터**로만 취급(지시문으로 해석 금지), 시스템 프롬프트 권위 유지.
- **폴백**: OpenRouter 장애/레이트리밋 시 **결정론-only 경로로 강등** + 사용자에게 "AI 보조 불가, 규칙 기반으로만 처리" 고지(로컬 모델 없음).

## 4. 요구사항

### 기능 요구사항 (FR)
- **FR-1 (읽기)**: 헤더행 자동 탐지(제목/설명행이 위에 있어도), 다중 시트, CSV EUC-KR/UTF-8 자동 감지. 1차 결정론 탐지 실패·애매 시 **StructureLLM**이 시트/헤더/컬럼 매핑을 판정.
- **FR-2 (매칭 — LLM 보조)**: ①결정론 프리필터(phone·정규화·editDistance)로 후보 top-K 축소 → ②애매행만 **MatchAdjudicatorLLM**이 최적 후보 선택(+confidence, +reason). phone 완전일치 등 확실건은 LLM 생략. 결과를 auto/needsConfirm/unmatched로 분류(신뢰도 임계값 반영).
- **FR-3 (중복방지 — 기간/완납 기준, 결정론)**: 판정 단위를 **paid_at의 달이 아니라 "대상 수강 건(enrollment=학생+강좌+분기)"** 으로. 저장 전 기존 `payment_records` + enrollment 납부상태 대조:
  - **L1 정확중복(existKey)**: 같은 enrollment·paid_at·금액 존재 → 재업로드, 기본 제외.
  - **L2 기간중복/초과**: 대상 enrollment가 **이미 완납**(`paid_amount ≥ effectiveFee`)이거나 **기존+신규 합이 수강료 초과** → 의심 → `needsConfirm`(UI 확인). 날짜가 아니라 "그 분기가 다 냈는가"로 보므로 **다른 달 같은 분기 중복도 잡음**.
  - **L3 정상 선납(통과)**: 결제 없는 **미래 분기 enrollment**로 매칭 → 통과(4월 완납자가 6월에 낸 7월분은 별도 enrollment).
  - 대상 분기는 매칭 결과 + **IntentLLM의 메모 해석**을 참고해 확정(단, 최종 완납/초과 산술은 결정론).
  - 부분납부(합계 ≤ 수강료)는 정상. 의심 행은 자동저장 금지 + 사유 뱃지.
- **FR-4 (UI 필터)**: 전체 행 표시(가상 스크롤), 행별 체크박스, "중복/미매칭/오류/AI저신뢰" 뱃지 + **AI 판정 사유·신뢰도** 표시, 상태별 일괄 제외.
- **FR-5 (결과)**: 저장 후 added / 중복스킵 / 미매칭 / 오류 / AI확인필요 분리 카운트.
- **FR-6 (동기화)**: 저장 후 enrollment 합계(`paid_amount/remaining/status/paid_at`) 재계산(은행 흐름과 공유).
- **FR-7 (모델 라우팅)**: 작업별 티어·폴백 매핑, 구조화 출력·재시도·캐시·강등 폴백(§3.3–3.4).

### 비기능 요구사항 (NFR)
- **NFR-1 (안전 레일)**: 중복/완납/초과·저장 게이트는 **결정론 순수 함수** + 단위 테스트. LLM 단독 자동저장 금지.
- **NFR-2 (구조화·검증)**: 모든 LLM 응답은 JSON 스키마 검증 통과분만 사용, 실패 시 재시도→폴백.
- **NFR-3 (OpenRouter 전용)**: 로컬 모델 코드경로 제거. 모든 추론은 OpenRouter. 키·모델은 설정 주입.
- **NFR-4 (비용 상한)**: 저가 기본 + 애매행만 상위 에스컬레이션 + 배치 + 캐시. 한 파일 처리의 예상 호출/토큰을 로깅해 가시화.
- **NFR-5 (프라이버시)**: 학생 결제 PII가 외부(OpenRouter)로 전송됨을 인지 — 필요한 최소 필드만 전송, 마스킹 가능한 항목 마스킹, 정책 문구 노출 검토.
- **NFR-6 (회귀 없음)**: 공유 엔진 변경 시 은행 흐름 골든 테스트 통과.

## 5. 아키텍처 방향

```
[Excel/CSV bytes]
   │
   ▼
UnifiedParser (결정론)           ← ExcelParser + parseBankExcel 통합
   │  헤더 자동탐지·시트·인코딩
   ├───(애매/실패)──▶ StructureLLM [T0]  ← 시트·헤더·컬럼 매핑 판정(구조화 출력)
   ▼
RowClassifier                    ← 결정론 정규화
   ├───(배치)──────▶ RowClassifyLLM [T0] ← 결제/합계/메모/환불 분류·필드 정제
   ▼
MatchEngine (결정론 프리필터)     ← phone/정규화/editDistance로 top-K 후보
   ├───(애매행만)──▶ MatchAdjudicatorLLM [T1] ← 후보 중 최적 선택 + confidence
   │                 IntentLLM [T1]           ← 메모→분기/개월 해석
   ▼
DedupChecker (결정론, 불가침)     ← L1/L2/L3 (완납·초과·기간) — 돈 안전
   ▼
ImportPreview (행별 status/사유/AI신뢰도)   ← UI 단일 모델
   │  ▲ 사용자 행별 포함/제외 (needsConfirm 확인)
   ▼
PersistService (결정론)          ← insert + enrollment 동기화 단일화

        ┌─────────────────────────────┐
        │ modelRouter (OpenRouter)     │  작업→티어·폴백·재시도·캐시·강등
        └─────────────────────────────┘
```

- **핵심 재사용**: `depositMatcher.ts`의 `norm/editDistance/findCourseInName`을 프리필터 공통 모듈로 분리.
- **중복 승격+재설계**: `existKey/monthKey`를 `DedupChecker`로 추출, 월키→기간/완납 기준 교체. 은행·일반 공통.
- **저장 통합**: `confirmImport`/`confirmBankDeposits`의 insert+동기화를 `PersistService`로 합침.
- **LLM 게이트웨이**: 모든 LLM 호출은 `modelRouter`를 통과(직접 벤더 호출 금지) → 티어·폴백·캐시·비용로깅 일원화.

## 6. 구현 로드맵

### Phase 0 — OpenRouter 정리 & 모델 라우터 `[MODERATE]`
- T0.1 로컬 모델 코드경로 제거(`DIRECT_DISPATCH_ALLOWLIST` 등 로컬 전제 정리), OpenRouter 단일화
- T0.2 `modelRouter.ts` 신설: 작업→`{primary,fallback[]}` 티어 매핑, 구조화 출력 헬퍼, 재시도, 콘텐츠 해시 캐시, 비용/호출 로깅, 강등 폴백
- T0.3 라우터 단위 테스트(스키마 검증 실패→재시도→폴백, 캐시 히트, OpenRouter 장애 시 결정론 강등)

### Phase 1 — 코어 엔진 통합 (매칭·중복, 결정론) `[MODERATE]`
- T1.1 `depositMatcher`에서 순수 유틸(norm/editDistance/findCourseInName) 분리 → `matching/` 공통, top-K 후보 산출
- T1.2 일반 흐름에 프리필터 매칭 도입, 상태 분류(auto/needsConfirm/unmatched)
- T1.3 `DedupChecker` 추출 + 기간/완납 재설계(L1/L2/L3), 월(paid_at) 키 제거, 은행·일반 공통
- T1.3b analyze/confirm이 enrollment 납부상태(`paid_amount/effectiveFee/paymentStatus`)를 함께 조회하도록 확장
- T1.4 골든 테스트: ①같은 분기 다른 달 재납부(정탐) ②완납 건 추가 입금(정탐) ③다음 분기 선납(통과) ④부분납부 미달(통과) ⑤정확 재업로드(제외)

### Phase 2 — LLM 보조 계층 `[COMPLEX]`
- T2.1 **StructureLLM**: 결정론 파서 실패/애매 시 시트·헤더·컬럼 매핑 판정(구조화 출력), 파서에 연결
- T2.2 **RowClassifyLLM**: 행 분류·필드 정제(배치), 비결제/합계/메모 행 자동 제외 후보로
- T2.3 **MatchAdjudicatorLLM**: 프리필터 top-K 애매행만 판정(+confidence+reason), 임계값→auto/needsConfirm
- T2.4 **IntentLLM**: 메모→분기/개월 해석, DedupChecker 입력으로 연결(산술은 결정론 유지)
- T2.5 LLM 계층 테스트: 특이 헤더/병합셀/영문컬럼, 동명이인, 강좌 약칭, 선납 메모 — 실제 유사 시나리오 픽스처

### Phase 3 — 파싱 통합 & 미리보기 UI `[MODERATE]`
- T3.1 헤더 자동 탐지·다중 시트·CSV 인코딩(결정론) 이식
- T3.2 `ImportPreviewCard` 행별 모델 재작성(전체 행 가상 스크롤)
- T3.3 행별 체크박스 + 중복/미매칭/오류/AI저신뢰 뱃지 + **AI 사유·신뢰도** 노출 + 상태별 일괄 제외
- T3.4 `confirmImport` 입력을 `selections[]`로 변경(은행과 동형), 결과 분리 카운트

### Phase 4 — 저장 통합 & 동기화 `[MODERATE]`
- T4.1 `PersistService`로 insert+enrollment 동기화 단일화, 일반 흐름 동기화 누락 수정
- T4.2 회귀 테스트(은행 흐름 불변) + 수익 페이지 반영 + 비용 로깅 확인

## 7. 리스크

| 리스크 | 영향 | 완화 |
|---|---|---|
| **LLM 환각으로 잘못된 학생/금액 매칭** | 높음 | LLM 단독 자동저장 금지, 결정론 교차검증, 저신뢰→needsConfirm(사용자 확인) |
| **PII(결제·이름)의 외부 전송** | 높음 | 최소 필드만·마스킹, 정책 고지, modelRouter에서 전송필드 화이트리스트 |
| 공유 엔진 변경이 은행 흐름 회귀 | 높음 | 은행 골든 테스트 먼저 고정 후 리팩토링 |
| **비용 폭증(대용량 파일)** | 중간 | 저가 기본+배치+캐시+애매행만 상위, 파일당 예상비용 로깅·상한 |
| **OpenRouter 장애/레이트리밋(로컬 폴백 없음)** | 중간 | 결정론-only 강등 + 사용자 고지, 재시도/백오프 |
| 완납/초과 판정이 잘못된 `fee`(할인·면제) 의존 | 중간 | `effectiveFee`(할인 반영) 사용, 경계값 needsConfirm |
| 분납(정상 부분납부) 초과 오탐 | 중간 | L2는 완납 이후 또는 합계 초과일 때만 발동 |
| 저장 트랜잭션 부재(부분 저장) | 중간 | 범위 밖, 배치 실패 폴백 유지 |
| 두 앱 UI 중복 반영 | 중간 | 카드 컴포넌트 `packages/ui` 승격 검토 |

## 8. 복잡도

- Phase 5개(0~4) · Task 약 22개 · 신규 파일 다수(modelRouter, matching, DedupChecker, PersistService, LLM 어댑터) · LLM 파이프라인 통합
- **complexity_estimate: COMPLEX**

## 9. 도메인 용어 (→ CONTEXT.md)

일반 흐름 / 은행 흐름 / 매칭 상태(auto·needsConfirm·needsEnrollment·needsSplit·needsRefund·unmatched) / 정확중복(existKey) / 기간중복(대상 enrollment=분기) / 완납초과 / 정상 선납 / enrollment 동기화 / 미리보기 선택(selections) / **제안-처분 원칙(LLM 제안·결정론 처분)** / **모델 티어(T0/T1/T2)** / **신뢰도 임계값** / **결정론 강등(폴백)**
