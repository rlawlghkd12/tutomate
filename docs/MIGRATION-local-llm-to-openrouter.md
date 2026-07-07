# 로컬 LLM → OpenRouter 전환 기획서 (통합본)

> 상태: **Draft (승인 대기)** · 작성일: 2026-07-03 · 유형: Migration
> 구성: 배경 → 현재/목표 구조 → 로드맵 → **모델 선정(저가형)** → 개인정보 → 리스크 → 롤백
> 가격 기준: 2026-07 OpenRouter/프로바이더 공식 가격(하단 Sources). **변동되므로 착수 시 재확인.**

---

## 1. 배경 & 목표

TutorMate AI 채팅은 현재 Electron 메인에서 **llama-server(llama.cpp)** 로 로컬 GGUF 모델(**Qwen 3.5 4B Q4**, ~2.91GB)을 구동한다. 이를 **OpenRouter 기반**으로 전환한다.

> **OpenRouter**: 여러 프로바이더(OpenAI·Anthropic·Google·Alibaba·DeepSeek 등) 모델을 **단일 OpenAI 호환 API + 단일 결제**로 라우팅하는 게이트웨이. 모델명만 바꿔 프로바이더를 오갈 수 있다.

**전환 이유**
- 최초 실행 시 ~2.91GB 다운로드·VC++ 재배포·하드웨어 진단 게이팅 → **온보딩 마찰**
- 저사양 PC는 AI가 `disabled` → 사용 불가 사용자 존재
- 상용 모델의 **한국어·툴콜 안정성** 우위
- OpenRouter 이점: **모델 무종속**(코드 변경 없이 교체·A/B·폴백), **강한 데이터 정책**(기본 무로깅·비학습, ZDR 강제)

**핵심 결정(확정)**
| 항목 | 결정 |
|------|------|
| 프로바이더 | **OpenRouter** (OpenAI 호환 게이트웨이) |
| 키/과금 | **중앙 프록시** — Supabase Edge Function이 `OPENROUTER_API_KEY` 보관·대리 호출, 플랜별 미터링 |
| 로컬 LLM | **완전 제거** |
| 개인정보 | §6 권고안(ZDR·비학습 강제 + 마스킹 + 동의 + 가명처리) |

**성공 기준**: 설치 직후 다운로드 0으로 즉시 사용 · 17개 툴 회귀 없음 · 키 비노출 · 플랜 한도 안내 · PII는 비학습·무로깅·ZDR 하에서만 전송.

---

## 2. 현재 구조 (As-Is)

```
Renderer(aiChatStore.send) ─ IPC: ai:chat ─► Main: aiHandler
  └ ensureRuntime() → createLlamaServerRuntime({ modelPath })   # LlamaRuntime 구현체
       └ spawn llama-server (OpenAI 호환 /v1/chat/completions)
       └ 에이전틱 루프(max 5): onToolCall → ActionDispatcher(client, Supabase RLS)
       └ ChatStreamEvent → ai:chat-event (token/tool_call/tool_result/card/usage/error/done)
```

핵심: 런타임은 이미 **`LlamaRuntime` 인터페이스(load/chat/resetSession/unload)** 로 추상화 + **OpenAI 호환 프로토콜** 사용. OpenRouter도 동일 프로토콜이라 **런타임 교체만으로 전환**. 툴 카탈로그·디스패처·시스템 프롬프트·이벤트 스키마 100% 재사용.

**재사용**: `ToolCatalog.ts`(17툴), `ActionDispatcher.ts`(RLS), `aiHandler.ts` SYSTEM_PROMPT(186줄), `ChatStreamEvent`, `ai:summarize`/`ai:dispatch`.
**제거**: `EngineManager`·`ModelManager`·`VcRedistInstaller`·`HardwareDiagnostic`·`LlamaServerRuntime`·`aiPaths`, 다운로드 IPC(`ai:download*`,`ai:needs`,`ai:ensure-vcredist`,`ai:diagnose`), `ModelDownloadModal`.

---

## 3. 목표 구조 (To-Be, C4 L1)

```
Renderer(aiChatStore.send)  ── 변경 없음(이벤트 스키마 동일)
  └ ensureRuntime() → createOpenRouterRuntime({ proxyUrl, getAccessToken })
       └ 에이전틱 루프(client): messages+tools ─► Supabase Edge Function [ai-proxy]
       │     └ Supabase JWT 검증 → 플랜/사용량 확인 → OPENROUTER_API_KEY 주입
       │     └ OpenRouter /api/v1/chat/completions (stream)
       │     │    · 모델명 = 환경변수(재배포 없이 교체)
       │     │    · provider 설정: 비학습·ZDR 프로바이더만 라우팅
       │     └ SSE relay → usage를 ai_usage_logs 기록
       └ SSE 파싱 → tool_calls → onToolCall(ActionDispatcher, client RLS)
       └ ChatStreamEvent → ai:chat-event (동일)
```

**원칙**: 툴 실행·에이전틱 루프는 **클라이언트 유지**(서버에 DB 권한 안 줌). 프록시는 **인증된 무상태 relay**이자 **유일한 키 소유자**. 모델명은 프록시 환경변수 → 무종속.

**신규 컴포넌트**: ① `supabase/functions/ai-proxy/index.ts` (relay+인증+미터링+provider 정책) ② `packages/electron-shared/src/ai/OpenRouterRuntime.ts` (`LlamaRuntime` 구현) ③ `ai_usage_logs` 테이블(+RLS).

---

## 4. Implementation Roadmap (6 Phase)

**Phase 0 — 설계 확정**: T0.1 모델 A/B(§5 저가 후보) → 기본 확정 · T0.2 프록시 API 계약+provider 라우팅 설계 · T0.3 플랜별 한도 정책(planLimits 연계) · T0.4 비용 시뮬(단가+크레딧 5.5%, `ai:summarize` 포함).

**Phase 1 — Edge Function `ai-proxy`**: T1.1 JWT 검증→org 확인 · T1.2 OpenRouter 스트리밍 relay+모델명 env화 · T1.3 `OPENROUTER_API_KEY` Secret · T1.4 **ZDR·비학습 프로바이더 강제 라우팅** · T1.5 `ai_usage_logs`+RLS · T1.6 사용량 집계+한도초과 402/429 · T1.7 rate limit/토큰 상한.

**Phase 2 — `OpenRouterRuntime`**: T2.1 `LlamaRuntime` 구현(load/unload/resetSession=no-op) · T2.2 chat()=프록시 호출+SSE 파싱→token · T2.3 tool_calls 델타 누적→onToolCall→append 재호출(에이전틱, max N) · T2.4 usage 매핑 · T2.5 error/abort/ZDR불가 구분 · T2.6 단위테스트(SSE·툴루프·에러).

**Phase 3 — aiHandler 통합/IPC 정리**: T3.1 `ensureRuntime()` 교체 · T3.2 `ai:status` 단순화 · T3.3 다운로드 계열 핸들러 제거 · T3.4 `ai:summarize`/`ai:dispatch` 정합 · T3.5 양쪽 앱 반영.

**Phase 4 — 프론트/동의 UX**: T4.1 `ModelDownloadModal` 제거 · T4.2 진입 단순화 · T4.3 **최초 외부 전송 동의 모달**(OpenRouter+프로바이더 국외이전 고지) · T4.4 한도/오프라인/오류 안내.

**Phase 5 — 로컬 자산 제거**: T5.1 로컬 AI 파일 삭제 · T5.2 electron-builder 번들에서 llama 바이너리 제거(설치 크기↓) · T5.3 죽은 코드/타입 정리+빌드 통과.

**Phase 6 — 개인정보/검증**: T6.1 **토큰화 볼트 구현**(§6-4: H1 툴결과 토큰화 / H2 툴인자 복원 / H3 렌더 시점 실명 복원 / H4 유저입력 토큰화) + PII 마스킹 계층 · T6.2 처리방침·데이터흐름 문서화(재위탁 반영) · T6.3 E2E(조회/임포트/은행입금 회귀, 한도·오프라인·취소, **토큰화 왕복 검증**) · T6.4 키 비노출+ZDR 라우팅 검증 + **전송 페이로드에 실명 미포함 확인**.

---

## 5. 모델 선정 — 저가형 기준 (출력 ≤ $1/1M)

> 사용자 요청: **출력 단가 $1/1M 이하** 저가형으로 한정 비교. TutorMate = 한국어 + 17툴 에이전틱 채팅.

### 5-1. 후보 비교 (per 1M tokens, OpenRouter pass-through, 별도 +5.5% 크레딧 수수료)

| 모델 | In | Out | 툴콜 안정성 | 한국어 | 이 앱 적합도 |
|------|---:|----:|-----------|--------|-------------|
| **qwen3-30b-a3b (instruct, MoE)** | ~$0.10 | ~$0.30* | ★ 저가군 1위(dropped-call 최저) | ★ 강함(CJK) | ◎ **최적** |
| deepseek-v4-flash | $0.14 | $0.28 | 양호 | 양호 | ○ 최저가 대안 |
| gemini-2.5-flash-lite | $0.10 | $0.40 | 보통 | 우수 | ○ 저비용+한국어 |
| qwen3-coder-next | $0.11 | $0.80 | 우수(코드 특화) | 양호 | △ 코드 편향 |
| gpt-4o-mini (legacy) | $0.15 | $0.60 | 양호 | 양호 | △ 레거시 |
| gpt-4.1-nano | $0.10 | $0.40 | 보통(nano 한계) | 양호 | △ |
| gpt-5-nano | $0.05 | $0.40 | 보통 | 양호 | △ |

*Qwen3-30B-A3B 정확 단가는 착수 시 OpenRouter에서 확인(컨텍스트 128k 초과 시 상향).
(참고·임계 초과 제외) gpt-4.1-mini $0.40/**$1.60**, gemini-2.5-flash $0.30/**$2.50**, claude-haiku-4.5 $1/**$5** → 품질 필요 시 프리미엄 플랜 옵션.

### 5-2. 이 앱에 맞는 선택 — **Qwen3-30B-A3B-Instruct (1순위)**
근거:
1. **툴콜 안정성**: 저가 구간에서 Qwen3가 invalid JSON/dropped tool call 비율 최저 → 17툴 에이전틱에 중요.
2. **한국어**: Qwen 계열은 CJK 강함.
3. **연속성**: 현재 로컬이 **Qwen 3.5 4B** → 같은 Qwen 계열이라 SYSTEM_PROMPT·툴 스키마 **재튜닝 최소**, 동작 편차 최소.
4. **비용**: 출력 ~$0.30/1M로 월 500명×100메시지 ≈ **$150~250** 수준(캐싱 전 보수적).

**대안**: 최저가 원하면 **DeepSeek V4 Flash**($0.14/$0.28), 한국어 안정 최우선이면 **gemini-2.5-flash-lite**.
**폴백**: OpenRouter라 기본 모델 장애·한도 시 다른 저가 모델로 즉시 전환(코드 변경 없음).

> **확정 (개발 착수)**: A/B 후보 **3종을 config에 등록**하고 모델 무종속으로 개발한다.
> 1. `qwen/qwen3-30b-a3b` — 기본값(한국어·연속성)
> 2. `deepseek/deepseek-v4-flash` — Nexus STAGE에서 한국어 실검증됨. **단 비중국+ZDR 프로바이더 라우팅 고정 전제**
> 3. `google/gemini-2.5-flash-lite` — 한국어·대용량 컨텍스트
> 모델명은 프록시 env로 교체, Phase 0에서 17툴 대화셋 A/B로 기본값 최종 확정.

### 5-3. 핵심 인사이트
- **스키마 품질이 모델 선택보다 툴콜 정확도에 더 큰 영향(10~20%)**. TutorMate는 이미 zod→JSON 스키마(`toToolDefinitions`) 보유 → **저가 모델로도 충분히 실용적**.
- Phase 0에서 실제 대화셋으로 **17툴 성공률 + 한국어 응답**을 Qwen3 vs DeepSeek vs Gemini-flash-lite 비교 후 최종 확정.
- **무료 모델은 로깅/학습 정책이 약해 PII에 부적합 → 제외.**

---

## 6. 개인정보 처리 방안

### 6-1. 문제 & 법적 쟁점
로컬은 데이터가 기기를 안 벗어났으나, 전환 시 **학생 실명·연락처·결제**가 **OpenRouter(미국) → 모델 프로바이더**로 이중 전송. 한국 **PIPA** 적용.
- **국외 이전 동의**(OpenRouter+프로바이더 양쪽 국외 가능), **처리위탁·재위탁 고지**, **최소수집·목적제한**. ※ 법무 검토 필요.

### 6-2. OpenRouter 데이터 정책(전환 강점)
기본 **무로깅·비학습**, **ZDR 강제**(ZDR 프로바이더에만 라우팅, 없으면 요청 실패), **로깅 프로바이더 배제 라우팅**, PAYG **리전 라우팅**.

### 6-3. 계층 옵션 & 권장안
| Lv | 방안 | 강도 | 난이도 | OpenRouter 연계 |
|----|------|:----:|:------:|------|
| L1 | PII 마스킹(전화/이메일 마스킹, 내부 ID·주소 제외) | 중 | 낮 | 앱 sanitizer |
| L2 | 최초 동의 + 처리방침 갱신(재위탁 고지) | 중 | 낮 | — |
| L3 | 프록시 무저장(토큰 수만 로깅) | 중상 | 낮 | 기본 무로깅과 정합 |
| L4 | **ZDR·비학습 프로바이더 강제** | 상 | 낮 | **설정으로 강제** |
| L5 | 이름 가명처리(실명→토큰, 표시 시 복원) | 최상 | 높 | 앱 |
| L6 | 리전 라우팅 | 상 | 중 | PAYG 지역 라우팅 |

> **1차 필수: L1+L2+L3+L4 + L5(토큰화 볼트 — §6-4, 클라우드 전송 전제 시 필수)**. **중기: L6.**

**데이터 흐름(권장안)**: 툴 실행(client,RLS) → PII 마스킹/가명처리 → 프록시(usage만 로깅, ZDR/비학습 provider) → OpenRouter(무로깅·비학습, ZDR) → 프로바이더(ZDR) → 응답 → 클라이언트 가명 복원.

**주의**: ZDR 강제 시 일부 프로바이더 배제로 **모델 선택지·비용 영향** → Phase 0에서 "ZDR ∩ 한국어/툴콜 우수" 교집합 확인(1순위 Qwen3의 ZDR 가용성 포함).

### 6-4. 토큰화 볼트 상세 설계 (L5 구체화 — "유저는 실명, LLM은 토큰")

> **전제**: 이 볼트는 **클라우드(OpenRouter) 전환 시에만 필요**하다. 로컬 llama-server는 localhost 통신이라 PII가 기기를 안 벗어나므로 볼트가 불필요(이득 0). 아래는 OpenRouter 전송을 전제로 한 안전장치다.
> **적합성**: 이 앱은 **툴이 사용자 기기(Electron 메인)에서 실행**되므로, 볼트(토큰↔실명 매핑)를 로컬에 두면 모델·프록시·OpenRouter·프로바이더 **누구도 실명을 못 본다.**

**목표**: 화면에는 실명(`김철수`, `010-1234-5678`), 모델 컨텍스트에는 토큰(`학생_A7`, `010-****`).

**볼트 정의**
- 세션 단위 양방향 매핑: `realValue ↔ token`. 학생은 **student id로 키잉**해 같은 학생은 항상 같은 토큰(모델이 상관관계 유지 가능).
- 저장 위치: **Electron 메인 프로세스**(툴 결과 생성·툴 인자 복원이 모두 여기서 일어남). 표시 복원용 매핑은 렌더러에도 전달.
- **영속화 금지**: 메모리/세션 한정. 디스크·프록시·로그에 매핑 저장 안 함.

**4개 훅 (실제 코드 지점)**

| # | 지점 | 위치 | 처리 |
|---|------|------|------|
| H1 | **툴 결과 → 토큰화** (최대 벡터) | `LlamaServerRuntime` 툴 메시지 push 직전(현행 411~421줄) | 결과 JSON의 실명/전화/이메일/주소를 토큰으로 치환 후 모델 컨텍스트에 삽입 |
| H2 | **모델 툴 인자 → 복원** | `onToolCall` 실행 직전(현행 402~409줄) | 모델이 넘긴 `학생_A7`→실제 id/값으로 복원 후 DB 조회 |
| H3 | **모델 답변 → 화면 실명** | 렌더러(`aiChatStore`), 누적된 assistant 텍스트 **렌더 시점** 치환 | 토큰→실명 역매핑. 누적 문자열에 적용해 **스트리밍 분할 문제 회피** |
| H4 | **발신 메시지 실명 → 토큰화** | 메인 `aiHandler` — `ai:chat`·`ai:summarize` 발신 직전(`tokenizeOutgoingMessages`) | 유저 입력·대화 요약 본문의 이름/전화를 볼트 토큰으로 치환. system 프롬프트는 제외. **클라우드로 나가는 모든 경로(chat+요약)를 커버** |

**토큰화 대상**
- 대상: **이름·전화·이메일·주소** (직접 식별자)
- 비대상: **금액·날짜** (모델이 계산·집계에 사용) → 원문 유지. 단 금액+날짜 조합의 **잔여 재식별 위험**은 인지하고 방어 심층화로 보완.

**한계 (솔직히)**
- **H4(유저 입력 이름 매칭)가 난제**: 별명·오타·동명이인 시 매칭 실패 → 토큰 불일치 가능. 완벽 보장 불가.
- **일부 질의 손상**: "김씨 성 학생들"처럼 이름 자체를 논리에 쓰는 질의는 토큰화 시 모델이 수행 불가 → 이런 케이스는 클라이언트 규칙 처리로 우회 필요.
- 그래서 **단독 의존 금지** → **토큰화 + ZDR·무로깅(L4) + 마스킹(L1) + 동의(L2)** 를 겹쳐 방어.
- **토큰 수명 = 볼트 수명(세션)**: 토큰(⟦S1⟧…)은 메인 프로세스 볼트 안에서만 의미가 있고 앱 재시작 시 초기화된다. 그래서 클라우드 백엔드에선 **대화 요약(토큰 상태)을 localStorage에 영속화하지 않는다**(세션 한정). 재시작 후엔 원문 메시지에서 다시 압축한다. ⚠️ 요약을 복원(detokenize)해서 저장하면 재주입 시 system 프롬프트로 실명이 클라우드에 유출되고, 토큰째 저장하면 새 세션 토큰과 충돌하므로 **둘 다 금지** — 반드시 세션 한정 유지.

**데이터 흐름(볼트 적용)**
```
[H4] 유저입력 토큰화 → 프록시 → OpenRouter(ZDR) → 모델(토큰만 봄)
모델 툴콜(토큰 인자) → [H2] 복원 → 툴 실행(client,RLS) → 결과 → [H1] 토큰화 → 모델
모델 답변(토큰) → 렌더러 [H3] 실명 복원 → 화면(유저는 실명)
```

---

## 7. 리스크

| # | 리스크 | 영향 | 완화 |
|---|--------|------|------|
| R1 | OpenRouter 키 유출 | 치명 | 중앙 프록시 Secret 보관, 번들/네트워크 검증(T6.4) |
| R2 | 비용 폭증/남용(+5.5% 수수료) | 높음 | 비용 시뮬(T0.4), rate limit·토큰 상한(T1.7), 플랜 한도(T1.6), 루프 max |
| R3 | 개인정보 이중 국외이전 | 높음 | **토큰화 볼트(§6-4)로 실명 미전송** + ZDR·비학습 강제(T1.4) + 마스킹(L1) + 재위탁 고지·동의 + 법무 검토 |
| R13 | 토큰화 불완전(H4 유저입력 이름 매칭 실패·동명이인, 금액/날짜 비토큰화 잔여 재식별) | 중간 | 방어 심층화(토큰화+ZDR+마스킹+동의 중첩), 매칭 실패 시 보수적 처리, 이름 논리 질의는 클라이언트 규칙 우회 |
| R4 | ZDR 강제 시 가용 모델 축소 | 중간 | Phase 0 "ZDR ∩ 우수 모델" 교집합 확인, 폴백 준비 |
| R5 | 프로바이더별 툴콜 편차 | 중간 | 기본 모델 확정 후 17툴 E2E(T6.3), SSE 파서 테스트(T2.6) |
| R6 | 오프라인 불가 | 중간 | AI 외 기능 영향 없음 안내(T4.4) |
| R7 | 품질/톤 회귀 | 중간 | SYSTEM_PROMPT 유지 + Qwen 연속성, 모델 A/B |
| R8 | 한도 초과 UX | 중간 | 402/429 규약+잔여량 안내, 저가 모델 소프트 다운그레이드 |
| R9 | OpenRouter 의존(SPOF) | 중간 | 장애 안내, 프록시 추상화로 직접 프로바이더 전환 여지 |
| R10 | 크레딧 만료(12개월 미사용)/무환불 | 낮음 | 자동 top-up, 사용량 모니터링 |
| R11 | 로컬 제거 시 빌드 파손 | 낮음 | Phase 5 점진 삭제+빌드/타입 게이트(T5.3) |
| R12 | 양쪽 앱 반영 누락 | 낮음 | 공통 코드 electron-shared/core 집중(T3.5) |

---

## 8. 롤백

- **전략 A(권장)**: 착수 직전 `git tag pre-openrouter-migration`, Phase 5(로컬 삭제)를 **별도 커밋**으로 분리 → 문제 시 해당 커밋만 `git revert`.
- **전략 B(OpenRouter 이점)**: 품질/비용/ZDR 이슈는 **프록시 모델명 env 교체**로 즉시 대응(재배포 불필요).
- **긴급 차단**: Edge Function 비활성 or `OPENROUTER_API_KEY` 회수 → 앱 배포 없이 AI 즉시 중단.

| 시점 | 롤백 |
|------|------|
| Phase 1~4 | `ensureRuntime()`→`createLlamaServerRuntime` 1줄 revert, 다운로드 UI 복원 |
| 운영 중 모델 문제 | 프록시 모델명 env 교체 |
| Phase 5 이후 | 태그 기준 삭제 커밋 revert + 로컬 자산 복원 재빌드 |
| 비용/개인정보 긴급 | Edge Function off / 키 회수 |

---

## 9. 영향 · 열린 질문 · Complexity

**영향**: 비용 무료→종량제(한도로 통제), AI 온라인 필수(그 외 기능 무영향), 설치 크기·온보딩 대폭 개선, 저사양 PC 사용 가능, 모델 유연성 확보.

**열린 질문**: 기본 모델 확정(Qwen3-30B-A3B 유력, DeepSeek/Gemini-lite 검증) · 플랜별 차등·무료 플랜 AI 여부 · 한도초과 정책(차단 vs 저가 폴백) · ZDR 강제 시 가용 모델 · 가명처리 범위 · 법무 검토.

**Complexity: COMPLEX** — 6 페이즈, 신규 서버 컴포넌트+런타임+대규모 로컬 제거, 신규 파일 3+.

---

## 10. 배포 & 운영 런북 (턴온 절차)

클라우드 경로는 **env 플래그로 게이팅**된다. 아래 순서로 켠다. (키는 있다고 가정)

### 10-1. 환경변수

**프록시 (Supabase Edge Function `ai-proxy` Secrets)**

| 변수 | 필수 | 기본값 | 설명 |
|------|------|--------|------|
| `OPENROUTER_API_KEY` | ✅ | — | 유일한 키 소유처. 미설정 시 프록시 500(`openrouter_not_configured`) |
| `OPENROUTER_MODEL` | — | `qwen/qwen3-30b-a3b` | 기본 모델. 재배포 없이 교체 가능 |
| `AI_MONTHLY_TOKEN_CAP` | — | `5000000` | 조직(없으면 사용자) 월 토큰 한도. `0`이면 무제한 |
| `AI_RATE_LIMIT_PER_MIN` | — | `0`(off) | 분당 완료 요청 수 한도. 초과 시 429(`rate_limited`). `0`이면 비활성 |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | 자동 | — | 플랫폼이 주입(JWT 검증·RLS 우회 insert용) |

**앱 (⚠️ 빌드 시점에 번들로 구워짐 — 런타임 env 아님)**

> 메인 프로세스는 패키징되면 사용자 PC에서 `process.env`가 비어 있다. 그래서 각 앱 `vite.config.ts`가
> 빌드 시점에 아래 값을 `.env`/셸 env에서 읽어 메인 번들에 `define`으로 구워 넣는다.
> **즉, `electron:build` 실행 직전에 이 값들이 env에 있어야 하며, 사용자 PC의 런타임 env로는 절대 켤 수 없다.**
> `VITE_SUPABASE_URL`은 이미 렌더러용으로 `.env`에 있으므로, `TUTOMATE_AI_PROXY_URL`을 안 줘도 프록시 URL이 유도된다.

| 변수 | 필수 | 기본값 | 설명 |
|------|------|--------|------|
| `TUTOMATE_AI_BACKEND` | ✅ | `llama`(로컬) | `openrouter`일 때만 클라우드 경로 활성. **빌드 시 설정** |
| `TUTOMATE_AI_PROXY_URL` | — | `${SUPABASE_URL\|VITE_SUPABASE_URL}/functions/v1/ai-proxy` 유도 | 명시 시 최우선 |
| `TUTOMATE_AI_MODEL` | — | (프록시 기본값) | A/B override. §5 후보 3종만 유효, 그 외 무시 |

### 10-2. 배포 순서

```bash
# 1) OpenRouter 대시보드: 계정 Privacy에서 ZDR(무보관)·비학습 설정 ON (프록시 provider.data_collection:'deny'와 함께)
# 2) 프록시 Secret 주입
supabase secrets set OPENROUTER_API_KEY=sk-or-... OPENROUTER_MODEL=qwen/qwen3-30b-a3b AI_MONTHLY_TOKEN_CAP=5000000
# 3) 마이그레이션 적용 (ai_usage_logs + ai_usage_month_total[_org])
supabase db push
# 4) Edge Function 배포
supabase functions deploy ai-proxy
# 5) 앱을 클라우드로 전환 — 빌드 시점에 env를 주고 빌드해야 번들에 구워진다(런타임 주입 불가!)
export TUTOMATE_AI_BACKEND=openrouter    # 필요 시 TUTOMATE_AI_MODEL로 A/B
pnpm --filter @tutomate/app electron:build   # 이 빌드 산출물에 openrouter 설정이 구워짐
# 확인: 산출물 메인 번들에 프록시 URL이 박혔는지
#   grep -o "functions/v1/ai-proxy" apps/tutomate/dist-electron/main-*.js
```

### 10-3. 검증 (E2E 스모크)

0. **로컬 모델 미설치 상태에서** AI 챗 열기 → 다운로드 모달이 뜨지 않고 바로 진행돼야 함. (클라우드 백엔드는 `ai:status`가 로컬 모델·엔진 검사를 건너뛰고 `ready`를 반환 — 4GB 로컬 모델 다운로드 불필요. `TUTOMATE_AI_BACKEND=openrouter` + proxyUrl 있을 때만 적용)
1. AI 챗 열기 → **개인정보 동의 모달** 노출 → [동의하고 시작]
2. 질문 전송 → 스트리밍 응답, 학생 이름은 UI에 실명(모델엔 토큰)
3. Supabase `ai_usage_logs`에 `organization_id` 채워진 1행 기록 확인
4. `AI_MONTHLY_TOKEN_CAP`을 80% 이상 소진되게(또는 낮게) 설정 → 챗 상단 **사용량 경고 배너**(warn: 노랑, exceeded: 빨강) 노출 확인
5. 한도 초과 유도 → 배너가 "한도 모두 사용" 안내로 바뀌고, 전송 시 "이번 달 한도" 친화 메시지(402) 확인

**사용량 조회 규약**: 프록시에 `{ "action": "usage" }`를 POST하면 채팅/토큰 소비 없이 `{ used, cap, scope, percent, remaining, level }`를 반환(402로 막지 않음 — 초과 상태도 조회 가능). 앱은 `ai:usage` IPC로 이를 호출해 채팅 진입 시·매 전송 시 배너를 갱신한다. `level`: `none`(<80%)·`warn`(80~99%)·`exceeded`(≥100%).

### 10-4. 긴급 롤백

- **앱만**: `TUTOMATE_AI_BACKEND` 해제(또는 `llama`) → 로컬 즉시 복귀(§8)
- **전면 차단**: `supabase functions delete ai-proxy` 또는 `OPENROUTER_API_KEY` 회수 → 앱 배포 없이 AI 중단

> 구현 현황(2026-07-03): Phase 1(프록시·사용량·조직 한도)·PII 볼트·OpenRouterRuntime·동의 모달·친화 에러·**월 사용량 조회 API + 한도 임박/초과 배너**·**일시적 오류(네트워크·429·5xx) 자동 재시도(스트리밍 전, 최대 2회 지수 백오프)** **구현+유닛테스트 완료**. 미완: 실키 E2E, 동의 문구 법무 검토, Phase 5(로컬 제거).

---

## Sources
- [Pricing | OpenRouter](https://openrouter.ai/pricing) · [OpenRouter FAQ (data policy/ZDR)](https://openrouter.ai/docs/faq)
- [Qwen API & Models | OpenRouter](https://openrouter.ai/qwen) · [Qwen3 30B A3B Pricing](https://pricepertoken.com/pricing-page/model/qwen-qwen3-30b-a3b)
- [Best AI for Tool Calling 2026](https://llm-stats.com/leaderboards/best-ai-for-tool-calling) · [LLM API Pricing 2026](https://pricepertoken.com/)
