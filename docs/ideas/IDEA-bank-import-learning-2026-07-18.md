# 은행 입금 자동입력 — "쓸수록 똑똑해지는 매칭" 아이디어 브리프

_2026-07-18 · TutorMate (학원관리, 어르신 친화) · 브라운필드 개선 아이디에이션_

## Executive Summary
현재 은행 거래내역서 → 결제 자동입력 기능은 매달 같은 애매한 입금을 **매번 처음부터 다시** 확인한다.
성숙한 자동대사 도구(Xero/QuickBooks)가 쓰는 4단계(Rule → Match → **Memory** → Prediction) 중
우리는 Rule/Match(퍼지 매칭)만 있고 **Memory(학습) 층이 없다.** 학습 층을 넣으면 매달 확인량이
**복리로 감소** → 사용자가 꼽은 "매달 반복 번거로움"이 근본적으로 해소되고, 동시에 매칭 정확도가 올라간다.

## 사용자 초점 (Discovery)
- **개선 방향**: 매칭 정확도 (수동 확인 줄이기)
- **가장 큰 불편**: 매달 반복 작업이 번거로움
- **규모**: 소규모 개선 ~ 큰 그림 스펙트럼 전부

→ 관통 주제: **정확도를 "학습"으로 끌어올려 매달 반복을 없앤다.**

## 핵심 통찰 — 빠진 것은 'Memory'
| 단계 | 하는 일 | 현재 우리 | 업계 |
|------|---------|-----------|------|
| Rule | 규칙 기반 매칭 | ✅ 강좌명 포함 탐지 | ✅ |
| Match | 퍼지/근사 매칭 | ✅ 편집거리·약어 | ✅ |
| **Memory** | **과거 확정을 기억해 재사용** | ❌ 없음 | ✅ Xero "Memory" |
| Prediction | 패턴 예측 | ❌ 없음 | ✅ |

우리는 매달 같은 "㈜한빛 = 박봄" 을 사용자가 다시 알려줘야 한다. Memory가 있으면 한 번 알려주면 끝.

---

## 아이디어 (소 → 대 스펙트럼)

### Tier 0 — 즉시 (현 구조에 바로, 각 ≤1일)
**I-1. 금액 근사 매칭 (수수료·부분납 허용)**
- 지금 `amountMatches`는 정확 일치. 이체 수수료 차감(-500~1,000원)·부분 납부가 needsConfirm으로 떨어짐.
- 허용 오차 + "부분 납부" 표시 추가 → needsConfirm 감소.
- 코드: `depositMatcher` `amountMatches` 계산부.

**I-2. 지난달 반복 입금 자동 인식**
- 같은 등록에 지난달 같은 금액 결제가 있으면(정기 수강료 패턴) 이번 auto 신뢰 상향.
- 이미 `analyzeBankDeposits`가 `existingPayments`를 조회하므로 데이터 확보됨.

### Tier 1 — 핵심 (며칠, 최대 임팩트) ⭐
**I-3. 입금자명 별칭 학습 (Payer Alias Memory)** — 센터피스
- 사용자가 애매한 입금자명을 특정 학생/등록으로 확정하면, **정규화된 입금자명 → 학생/등록 매핑**을 org별로 저장.
- 다음 파싱에서 별칭 정확 히트 → 즉시 auto. 매달 자동화율이 복리로 상승.
- 스케치: `payer_aliases(org_id, payer_norm, student_id, enrollment_id?, hit_count, last_confirmed_at)`
  - `confirmBankDeposits` 확정 시 write, `analyzeBankDeposits` 매칭 직전 alias lookup(최우선).
- Xero "Memory" / QuickBooks 규칙과 동일한, 업계 검증된 패턴.

**I-4. 학생 프로필 별칭 사전 등록**
- "이 학생은 남편 이름 '김철수' / 회사 '㈜한빛'으로 입금" 을 학생 화면에서 미리 등록.
- I-3(자동 학습)과 합쳐 **첫 달부터** 정확. 학습을 기다릴 필요 없는 보완재.

### Tier 2 — 워크플로우 (중간)
**I-5. 월간 마감 화면 (Monthly Close)**
- ad-hoc 업로드를 "3월 마감" 루틴으로 구조화: 예상 입금(등록자 명단) vs 실제 입금(거래내역) **대사표** + 미납자 자동 추출.
- "매달 반복"을 없애진 못해도 **빠르고 명확한 의식**으로 만들어 체감 부담↓.

**I-6. 신뢰도 뱃지 + 자동저장 임계선 조절**
- 매치별 confidence 점수 노출. 학습이 쌓이면 사용자가 "이 정도 확신이면 그냥 저장" 임계선을 올려 확인량↓.

### Tier 3 — 빅베팅 (다음 버전)
**I-7. 정기 자동 리마인드 + 원클릭 마감**
- 매달 1일 "지난달 거래내역서 올려주세요" 알림 → 올리면 학습된 매칭으로 90%+ auto → 원클릭. 반복이 사실상 증발.

**I-8. 미납 관리 통합 + 알림톡 문안 생성**
- 대사 후 자동 미납자 리스트 + 카카오 알림톡 독촉 문안 생성. "돈 확인"→"안 낸 사람 챙기기"까지 한 흐름.

**I-9. 오픈뱅킹/스크래핑 자동 거래내역**
- 엑셀 업로드 자체 제거 — 오픈뱅킹 거래내역 조회 API 또는 CODEF류 스크래핑으로 자동 수집.
- 한국 오픈뱅킹은 거래내역 조회 API 제공, 사업자계좌 범위 확대 중(FSC). 단 **핀테크 등록·보안·비용** 부담 → 사전 검증 필수.

---

## 우선순위 (복리 경로)
```
빠른 승리:   I-1, I-2  (즉시 needsConfirm 감소)
       ↓
키스톤:      I-3 (별칭 학습) + I-4 (사전 등록)   ← 여기서 매달 반복이 꺾인다
       ↓
구조화:      I-5 월간 마감 + I-6 임계선
       ↓
빅베팅:      I-7 자동 리마인드 → I-8 미납 통합 → I-9 오픈뱅킹
```
**추천**: I-3(별칭 학습)을 중심축으로. I-1/I-2로 즉효를 내고, I-3/I-4로 "매달 줄어드는" 복리를 만들고,
그 위에 I-5~I-9를 쌓는다.

## Impact / Effort
| ID | 정확도 | 반복 제거 | 노력 | 규모 |
|----|:---:|:---:|:---:|----|
| I-1 금액 근사 | ●● | ● | 낮음 | 소 |
| I-2 지난달 반복 | ●● | ●● | 낮음 | 소 |
| **I-3 별칭 학습** | ●●● | ●●● | 중 | 중 |
| I-4 별칭 사전등록 | ●●● | ●● | 낮~중 | 소~중 |
| I-5 월간 마감 | ● | ●●● | 중 | 중 |
| I-6 신뢰도 임계선 | ●● | ●● | 중 | 중 |
| I-7 자동 리마인드 | ● | ●●● | 중~높 | 대 |
| I-8 미납 통합 | – | ●● | 중~높 | 대 |
| I-9 오픈뱅킹 | ●● | ●●● | 높음 | 대 |

## 리스크 / 검증 필요
- **I-3 학습의 오학습**: 잘못 확정한 매핑이 학습되면 매달 틀림 → 별칭에 hit_count·마지막확정일 두고 쉽게 수정/삭제, 재확인 유도.
- **I-9 오픈뱅킹**: 핀테크 등록·정보보호·API 비용·약관. 착수 전 사업자계좌 지원 범위와 CODEF류 비용 라이브 검증.
- **I-8 알림톡**: 카카오 알림톡 발신 자격·템플릿 심사·건당 비용 확인.
- 전 항목 공통: 어르신 UX 원칙(단계형·큰 버튼·되돌리기) 유지.

## Domain Terminology
| Term | 한국어 | 정의 |
|------|--------|------|
| Payer Alias | 입금자 별칭 | 은행에 찍히는 입금자명 문자열 ↔ 학생/등록 매핑(학습 대상) |
| Memory Match | 학습 매칭 | 과거 확정 이력으로 즉시 auto 처리하는 단계 |
| Monthly Close | 월간 마감 | 한 달 입금을 예상 vs 실제로 대사·확정하는 루틴 |
| Reconciliation | 대사 | 은행 거래내역과 시스템 결제기록을 맞추는 작업 |
| Confidence Threshold | 자동저장 임계선 | 이 신뢰도 이상이면 확인 없이 자동 저장하는 기준값 |

## Confidence Level: Medium-High
(핵심 아이디어 I-1~I-6은 현 코드 기반으로 실현성 높음. I-7~I-9는 외부 연동/비용 라이브 검증 필요.)

## Sources
- [Innovating Korea's open banking — OECD OPSI](https://oecd-opsi.org/innovations/innovating-koreas-financial-payment-infrastructure-with-open-banking/)
- [South Korea Open Banking / MyData & KFTC — Fiskil](https://www.fiskil.com/open-finance-tracker/south-korea)
- [Best bank reconciliation software (learning/Memory patterns) — Xero](https://www.xero.com/us/accounting-software/reconcile-bank-transactions/)
- [Automated account reconciliation tools — Relay](https://relayfi.com/blog/automated-account-reconciliation-software/)
