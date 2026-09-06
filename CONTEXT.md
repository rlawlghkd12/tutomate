# CONTEXT — 도메인 용어

> AI 엑셀 결제 임포트 기획(`docs/PLAN-ai-payment-import.md`)에서 추출한 도메인 용어. 코드/문서에서 아래 용어를 일관되게 사용한다.

## Language

| Term | 정의 | Avoid |
|---|---|---|
| 일반 임포트 흐름 (General Import) | 표준 양식 엑셀(이름/전화/금액/날짜)을 읽어 결제를 넣는 경로 (`parseExcelHeaders→mapColumns→previewImport→confirmImport`) | "엑셀 임포트"(모호) |
| 은행 흐름 (Bank Deposits) | 통장 입출금 내역 엑셀을 읽어 입금을 결제로 매칭하는 경로 (`analyzeBankDeposits→confirmBankDeposits`) | "통장 임포트" |
| 매칭 상태 (MatchStatus) | 각 행의 처리 분류: auto / needsConfirm / needsEnrollment / needsSplit / needsRefund / unmatched | "성공/실패" 이분법 |
| 정확중복 (existKey) | 기존 결제와 `enrollment_id\|paid_at\|amount` 완전일치 중복 (재업로드) | — |
| 기간중복/완납초과 (periodDup) | **대상 수강 건(enrollment=학생+강좌+분기)** 기준 중복. 그 건이 이미 완납이거나 기존+신규 합이 `fee` 초과 → 의심. 납부 **날짜**가 아니라 **어느 분기 결제인가**로 판정 | "월중복(monthKey)" — paid_at 달 기준은 폐기(다른 달 같은 분기 중복을 놓침) |
| 정상 선납 (prepay) | 아직 결제 없는 **미래 분기** enrollment로 매칭된 결제 → 중복 아님, 통과 | "중복"으로 오탐 금지 |
| enrollment 동기화 | 결제 저장 후 `paid_amount/remaining_amount/payment_status/paid_at` 재계산 | "잔액 갱신"(부분적) |
| 미리보기 선택 (selections) | 사용자가 미리보기에서 포함으로 고른 행 목록 (confirm 입력) | "체크된 행" |
| 제안-처분 원칙 (propose-dispose) | **LLM은 읽기·해석·후보판정을 "제안"**, **돈이 바뀌는 결정(저장·중복확정)은 결정론 규칙+사용자 확인이 "처분"**. LLM 단독 자동저장 금지 | "AI가 다 알아서 저장" |
| 모델 티어 (T0/T1/T2) | OpenRouter 작업별 모델 등급. T0=초저가(구조·행분류 대량), T1=중가(매칭·의도 판정), T2=상위(저신뢰 잔여 에스컬레이션) | 특정 모델명 하드코딩 |
| 신뢰도 임계값 (confidence threshold) | LLM 판정 confidence가 임계 미만이면 `auto` 금지 → `needsConfirm`으로 UI 확인 | — |
| 결정론 강등 (deterministic fallback) | OpenRouter 장애/레이트리밋 시 규칙 기반 경로로만 처리 + 사용자 고지 (로컬 모델 없음) | "AI 꺼짐"(모호) |
| 모델 라우터 (modelRouter) | 모든 LLM 호출의 게이트웨이: 티어·폴백·구조화출력·재시도·캐시·비용로깅·강등 일원화 (`packages/core/src/ai/modelRouter.ts`) | 벤더 직접 호출 |

## Relationships
- **일반 흐름**과 **은행 흐름**은 매칭·중복·저장 **코어를 공유**하도록 통합한다(기획 목표).
- **매칭 상태**가 `auto`가 아니면 자동 저장 금지 → **미리보기 선택**을 거쳐야 저장.
- 중복 판정은 **매칭이 대상 enrollment(분기)를 확정한 뒤** 수행한다(MatchEngine → DedupChecker 순서). "언제 냈나"가 아니라 "무엇(어느 분기)에 대한 결제인가"로 본다.
- **정확중복**은 기본 제외, **기간중복/완납초과**는 `needsConfirm`으로 UI 확인 강제, **정상 선납**은 통과.

## Flagged Ambiguities
- `duplicated` 카운터(현행 `confirmImport`)는 "중복/미매칭/전화없음/등록모호"를 뭉뚱그린다 → 신규 설계에서는 **매칭 상태**와 **중복(existKey/기간중복)** 을 분리 표기한다.
- 폐기: `monthKey`(paid_at의 YYYY-MM). 같은 분기를 다른 달에 재납부하면 못 잡고, 서로 다른 분기를 같은 달에 내면 오탐. → **기간중복/완납초과**로 대체.
- 완납 판정의 `fee`는 **할인·면제 반영한 effectiveFee**를 쓴다(정가 아님).
- `monthly_payments` 테이블은 임포트 경로에서 쓰지 않음(조회 전용). 저장 대상은 `payment_records`.
- **로컬(4B) 모델 폐기(2026-09-01)**: 모든 추론은 OpenRouter 경유. `DIRECT_DISPATCH_ALLOWLIST` 등 로컬 전제 코드는 정리 대상.
- 중복/완납/초과 **산술 판정은 결정론 불가침** — LLM은 메모→분기 **해석 힌트**만 제공하고 최종 계산엔 관여하지 않는다.
