# MODELS — AI 결제 임포트 모델 선정

> ## ⛔ SUPERSEDED (2026-09-03) — 설계 이력 문서
> 임포트에서 **LLM을 전면 제거**하고 완전 결정론 파이프라인으로 전환했다(DEV 상단 정정 참조).
> 따라서 이 모델 선정 문서는 **더 이상 유효하지 않으며 설계 이력으로만 보존**한다. 임포트는 모델을 쓰지 않는다.
> (LLM/모델 논의는 일반 챗봇 흐름에만 해당 → `docs/MIGRATION-local-llm-to-openrouter.md`.)

> 작성일: 2026-09-02 · 짝문서: `docs/DEV-ai-payment-import.md`, `docs/PII-COST-ai-payment-import.md`
> 근거: 현행 `openRouterConfig.ts` 후보 + OpenRouter 실시간 가격/기능 조회(2026-09, 하단 출처).
> 모든 추론은 OpenRouter 경유. 가격은 조회 시점 기준(변동 가능) → 배포 전 재확인.

## ⚠️ 검증 정정 (2026-09-02)
초안에서 `gemini-3.1-flash-lite`·`gemini-2.5-flash-lite`·`deepseek-v4-flash`(무버전)를 검증 없이 사용했으나, **실제 모델 페이지 확인 결과 존재가 불확실하거나 없음**. 아래는 **페이지 실측으로 존재를 확인한 슬러그·가격**만 사용한다. 모델 슬러그는 수시로 바뀌므로 **구현 시점에 라이브 목록(`/api/v1/models`)으로 재확인** 후 코드에 핀 고정한다.
> **코드 정합성 이슈:** 현행 `openRouterConfig.ts`의 `OPENROUTER_CANDIDATES`(`qwen3-30b-a3b`, `deepseek-v4-flash`, `gemini-2.5-flash-lite`, `gemini-3.1-flash-lite`) 중 뒤 3개는 검증 안 됨 → **Phase 0에서 검증된 슬러그로 교체**.

## 0. 결론 (2026-09-02 결정 — **전 티어 DeepSeek 단일화**)

사용자 결정: **모든 임포트 LLM 스테이지를 DeepSeek 단일 모델로.** 최저가·툴콜·구조화출력·대용량 컨텍스트를 모두 갖춰 4개 스테이지를 한 모델로 커버 → 라우터·설정·A/B 단순화, 파일당 비용 ≈ 2원 이하.

| 티어 | 용도 | 모델 | 근거 |
|---|---|---|---|
| **T0 = T1 = 전부** | 구조·행분류·매칭판정·메모해석 | **`deepseek/deepseek-v4-flash-0731`** ✅ | 최저가($0.05/$0.10) + 1.3M ctx + `response_format` + tool calling. 지연허용 대량은 `:batch` 검토 |
| **폴백(선택, 저신뢰 전용)** | DeepSeek 저신뢰 한국어 케이스만 | `google/gemini-3.5-flash-lite` ✅ | 한국어 뉘앙스 백업. 스위치로 on/off. 기본 off도 가능(저신뢰→바로 사용자 확인) |
| 기타 | 일반 대화(기존) | `qwen/qwen3-30b-a3b`(현 기본) 유지 | 현행 연속성(슬러그 유효성 재확인) |

✅ = 2026-09-02 OpenRouter 모델 페이지에서 존재·가격 실측.

> **트레이드오프(명시):** DeepSeek는 한국어 미묘함(동명이인·강좌 약칭 판정)이 Gemini보다 약할 수 있음. 그러나 **저신뢰→needsConfirm(사용자 확인)** 안전장치가 오판의 자동 저장을 막으므로 단일화 리스크는 제한적. A/B에서 매칭 정확도가 목표 미달이면 **T1(매칭·메모)만 gemini-3.5-flash-lite로 승격**하는 폴백 경로를 남겨둔다.

> **핵심 발견:** 확인된 후보 모두 `response_format`(JSON 스키마) **네이티브 구조화 출력** 지원 → DEV §2.2의 "강제 함수호출 우회"는 **필수 아님**. ai-proxy가 `response_format`만 통과시키면 됨. (강제 함수호출은 미지원 모델용 폴백으로만.)
> **배치 절감:** API 목록상 `:batch` 변형(예: `gemini-3.5-flash-lite:batch` ≈ $0.15/$1.25)이 있어 **T0 대량·지연허용 작업에 반값** 활용 여지 → Phase 0에서 지원 여부 확인.

## 1. 선정 기준 (하드 필터 → 소프트)

1. **[하드] tool/function calling 지원** — 매칭 등에서 도구 호출/구조화 출력 필요.
2. **[하드] 구조화 출력**(`response_format` JSON 스키마 or 강제 tool_choice) — 파싱 안정성.
3. **[소프트] 한국어 품질** — 이름 변형·강좌 약칭·메모 해석의 핵심(특히 T1).
4. **[소프트] 가격** — T0는 대량이라 최우선, T1은 소수라 후순위.
5. **[소프트] 컨텍스트 길이** — 배치 처리에 여유(모두 1M 수준).
6. **[소프트] 지연시간** — flash/lite 계열로 충분.

## 2. 후보 매트릭스 (2026-09-02 실측, 1M 토큰당 USD)

| 모델(slug) | 입력 | 출력 | 컨텍스트 | 툴콜 | 구조화출력 | 검증 | 메모 |
|---|---|---|---|---|---|---|---|
| `deepseek/deepseek-v4-flash-0731` | **$0.050** | **$0.100** | 1.3M | ✅ | ✅ `response_format` | ✅ 페이지 | 최저가·대량 T0 |
| `google/gemini-3.5-flash-lite` | $0.30 | $2.50 | 1M | ✅ | ✅ | ✅ 페이지 | 한국어 강함, T0 폴백/T1 폴백 |
| `google/gemini-3.6-flash` | $0.75 | $3.75 | — | ✅ | ✅ | ✅ API목록 | T1 primary |
| `google/gemini-3.7-flash` | $0.75 | $3.75 | — | ✅ | ✅ | ✅ API목록 | 최신 flash, T2 |
| `qwen/qwen3-30b-a3b` (현 기본) | ~$0.12 | ~$0.12 | — | ✅(앱 사용중) | tool_choice | ⚠️ 재확인 | 일반 대화 |
| ~~`gemini-2.5/3.1-flash-lite`~~ | — | — | — | — | — | ❌ 미검증 | 초안 오류, 폐기 |
| ~~`deepseek-v4-flash`(무버전)~~ | — | — | — | — | — | ❌ 없음 | 버전 슬러그만 존재 |

> **배치 변형**: `google/gemini-3.5-flash-lite:batch` ≈ $0.15/$1.25(반값), `deepseek-v4-flash-0731:batch`도 존재 → T0 대량에 활용 검토.

## 3. 티어별 배정 상세

### 전 스테이지 — deepseek-v4-flash-0731 (단일)
- **작업**: StructureLLM·RowClassifyLLM·MatchAdjudicator·IntentLLM 모두 동일 모델.
- **장점**: 라우터가 사실상 "한 모델 + 재시도·캐시·강등"만 관리 → 구현·운영 단순. 최저가로 비용 최소.
- **구조화**: `response_format`로 스키마 강제. 대량·지연허용 스테이지(구조·행분류)는 `:batch` 변형으로 반값 검토.
- **한국어 리스크 관리**: 매칭/메모 판정에서 confidence<임계면 자동 저장 금지 → `needsConfirm`. 오판이 돈으로 이어지지 않음.

### 폴백(선택) — gemini-3.5-flash-lite
- DeepSeek가 저신뢰를 반환한 **매칭·메모 케이스만** 승격 재시도. 스위치(`import.llmFallback`)로 on/off.
- 기본 off여도 동작(저신뢰→바로 사용자 확인). A/B에서 정확도 목표 미달 시 on.

## 4. 파일당 비용 재계산 (300행 가정)

전부 deepseek-v4-flash-0731($0.05 입력 / $0.10 출력) 기준, 300행 파일:

| 스테이지 | 호출 | 입력토큰(≈) | 출력토큰(≈) |
|---|---|---|---|
| Structure | 1 | 1.5K | 0.3K |
| RowClassify | 6 | 9K | 1.5K |
| MatchAdjudicate | 3 | 6K | 1.5K |
| Intent | 2 | 2K | 0.5K |
| **합계** | 12 | ~18.5K | ~3.8K |

- 비용 ≈ 18.5K×$0.05/M + 3.8K×$0.10/M ≈ **$0.0013 (약 2원/파일)**.
- 캐시 히트(재업로드/재시도) → 0원. `:batch`(반값) 적용 시 더 낮아짐.
- 사실상 비용은 무시 가능한 수준 → 정확도(한국어 매칭)만 A/B로 확인.

## 5. A/B 검증 계획 (배포 전)
- **한국어 골든셋**: 실제 유사 파일(익명화)로 매칭/분류 정확도 측정 — T0 deepseek vs gemini-2.5-flash-lite, T1 gemini-3.1 vs 2.5.
- **지표**: 매칭 정확도, 오탐/미탐, 파싱 성공률, 파일당 비용·지연.
- **전환 방법**: `OPENROUTER_CANDIDATES` 내에서 `TUTOMATE_AI_MODEL`/프록시 env로 무재배포 교체.
- **초기 신뢰도 임계값** 0.8 → 골든셋으로 튜닝.

## 6. 리스크 / 오픈 이슈
| 항목 | 대응 |
|---|---|
| deepseek 한국어 헤더/메모 약할 가능성 | T0 폴백 gemini-2.5-flash-lite, 골든셋으로 검증 후 확정 |
| 가격/모델 변동(신모델 등장) | 라우팅은 slug 매핑만 → 교체 용이. 분기별 재확인 |
| `response_format` 프록시 미지원 | ai-proxy에 통과 로직 추가(우선), 미지원 모델은 강제 tool_choice 폴백 |
| 국외이전(PII) | `docs/PII-COST` 체크리스트 — ZDR·비학습 ON, 동의 문구 |

## 출처 (2026-09-02 실측)
- [OpenRouter 모델 목록 API](https://openrouter.ai/api/v1/models)
- [Gemini 3.5 Flash Lite — OpenRouter](https://openrouter.ai/google/gemini-3.5-flash-lite) — 존재·$0.30/$2.50 확인
- [DeepSeek V4 Flash 0731 — OpenRouter](https://openrouter.ai/deepseek/deepseek-v4-flash-0731) — 존재·$0.050/$0.100 확인
- 미검증/폐기: `gemini-3.1-flash-lite`, `gemini-2.5-flash-lite`, `deepseek-v4-flash`(무버전)
