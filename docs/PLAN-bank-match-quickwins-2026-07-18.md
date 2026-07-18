# PLAN — 은행 매칭 즉시 개선 (Quick Wins)

_2026-07-18 · TutorMate · 브라운필드 · doc-sync: local_
_출처 아이디어: [IDEA-bank-import-learning-2026-07-18](ideas/IDEA-bank-import-learning-2026-07-18.md)_

## 목표
"당장 할만한거" — DB 마이그레이션·외부 연동 없이 **순수 매칭 로직만으로** 정확도를 올리고
매달 반복 확인을 줄인다. 전부 `depositMatcher`(순수 함수) + `analyzeBankDeposits` 범위 → TDD 가능.

## 범위 (Phase 1 = 이번 구현)
### I-1. 금액 근사 매칭 (수수료 차감·부분 납부 인식)
현재 `amountMatches: course.fee === tx.amount` (정확 일치만). 그 외는 뭉뚱그려 "금액 불일치".
- **수수료 차감 추정**: `0 < fee - amount ≤ TOLERANCE(1,000원)` → "수수료 빼고 딱 맞아요" 라벨, 후보 최상단 정렬.
- **부분 납부**: `amount < fee - TOLERANCE` → "부분 납부 · 남은 금액 {n}" 라벨.
- **초과 입금**: `amount > fee` → "수강료보다 많아요" 라벨(합산 분할 후보 힌트).
- 안전 원칙: **auto(자동 저장)는 정확 일치일 때만** 유지. 근사/부분은 needsConfirm이되 **명확한 라벨 + 최상단**으로 1탭 확인.
- 파일: `depositMatcher.ts` (amountMatches 계산부, MatchCandidate에 `amountNote` 추가)

### I-2. 지난달 반복 입금 자동 인식 (Recurring)
매달 같은 학생이 같은 금액을 같은 등록에 내는 정기 수강료 패턴을 인식해 확인을 쉽게.
- `analyzeBankDeposits`가 이미 조회하는 `existingPayments`에서, **직전 달(들)에 tx.amount와 같은 결제**가 있는 후보를 `recurring`로 표시.
- needsConfirm(특히 이름만 입력) 건에서 recurring 후보를 **최상단 + "지난달에도 이 금액을 여기에 내셨어요" 라벨**.
- 안전 원칙: 자동 저장 승격은 하지 않음(수강 중단 가능성) — 확인은 유지하되 인지 부담↓.
- 파일: `analyzeBankDeposits.ts`(recurring 판정), `depositMatcher.ts`(MatchCandidate `recurring` 필드), 카드(뱃지)

## 범위 밖 (Phase 2 — 다음, 별도 계획)
- **I-3 입금자명 별칭 학습(Payer Alias Memory)** — 키스톤이지만 신규 테이블 `payer_aliases` +
  Supabase 마이그레이션/RLS 필요. (이 세션은 supabase 인증 미연결 → 배포·실검증 제한). 별도 진행.
- I-4 학생 프로필 별칭 사전등록(학생 UI), I-5+ 워크플로우/빅베팅.

## 구현 순서 (Phase 1)
1. **I-1 매처 로직** — `amountNote` 필드 + 근사/부분/초과 분류 (TDD: 수수료차감·부분·초과·정확)
2. **I-1 카드 라벨** — needsConfirm/needsEnrollment 카드에 amountNote 문구 노출 (양쪽 앱 미러)
3. **I-2 recurring 판정** — analyze에서 existingPayments 기반 recurring 표시 + 최상단 정렬
4. **I-2 카드 뱃지** — recurring "지난달에도…" 라벨 (양쪽 앱 미러)
5. **검증** — core vitest(matcher 신규 테스트) + 양쪽 앱 `tsc -b`

## 수용 기준 (Acceptance Criteria)
- AC-1: 수강료 60,000 / 입금 59,500(수수료차감) → "수수료 빼고 딱 맞아요" 라벨 + 후보 최상단. auto 아님.
- AC-2: 수강료 60,000 / 입금 30,000 → "부분 납부 · 남은 금액 30,000" 라벨.
- AC-3: 정확 일치는 기존과 동일하게 auto 유지(회귀 없음).
- AC-4: 이름만 입금인데 직전 달 같은 금액 결제 이력 있는 등록 → recurring 라벨 + 최상단.
- AC-5: core 788+ 테스트 전부 통과, 양쪽 앱 tsc -b exit 0.

## 리스크
- 근사 매칭 TOLERANCE 과다 → 다른 강좌 오매칭. 완화: 작은 절대값(1,000원) + auto 승격 금지.
- recurring 오인(수강 중단 후 타 용도 입금) → 자동 저장 안 함, 라벨만.
- 어르신 UX: 라벨/뱃지는 큰 글씨·명확 문구 유지.

## Complexity: SIMPLE
(1 phase · ~5 task · 신규 파일 없음 · 순수 로직 + 카드 라벨)

## Domain Terminology
| Term | 한국어 | 정의 |
|------|--------|------|
| Near Match | 근사 매칭 | 수수료 차감 등으로 수강료와 소액 차이 나는 입금 |
| Partial Payment | 부분 납부 | 수강료보다 적게 낸 입금(잔액 존재) |
| Recurring | 정기 반복 | 직전 달 동일 등록·동일 금액 결제가 있는 패턴 |
