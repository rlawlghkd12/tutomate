/**
 * OpenRouter 백엔드 LlamaRuntime 구현 (모델 무종속).
 *
 * 로컬 llama-server 대신 Supabase Edge Function(ai-proxy)을 경유해
 * OpenRouter의 OpenAI 호환 /chat/completions 를 스트리밍으로 호출한다.
 *
 * 설계:
 * - 프록시가 OPENROUTER_API_KEY 보관·모델명·프로바이더(ZDR/비학습) 라우팅 담당 → 앱엔 키 없음.
 * - 툴 실행·에이전틱 루프는 클라이언트(여기)에서 유지 (서버에 DB 권한 안 줌).
 * - 이벤트 스키마·툴 정의는 LlamaServerRuntime과 동일 → aiHandler/프론트 재사용.
 * - 답변이 length로 잘리면 자동 이어쓰기(LlamaServerRuntime과 동일 정책).
 *
 * 로컬 런타임과 공존: aiHandler의 백엔드 플래그로 선택되며, 이 파일은 로컬 코드를 건드리지 않는다.
 */

import type { ToolDefinition, PiiVault } from '@tutomate/core';
import type { LlamaRuntime } from './LlamaRuntime';

/** 도구 호출 라운드 한도 (무한 루프 방지) */
const MAX_TOOL_ROUNDS = 5;
/** length로 잘렸을 때 자동 이어쓰기 최대 횟수 */
const MAX_CONTINUATIONS = 3;
/** 응답당 출력 토큰 상한 (긴 답변은 이어쓰기로 이어붙임) */
const MAX_OUTPUT_TOKENS = 2048;
/** 단일 도구 결과를 컨텍스트에 넣을 때 최대 글자수 (클라우드는 컨텍스트가 커서 로컬보다 여유) */
const MAX_TOOL_RESULT_CHARS = 8000;
/** UI 컨텍스트 미터 표시에 쓰는 명목 컨텍스트 크기 (모델별 실제값은 프록시가 관리) */
const NOMINAL_CTX_SIZE = 128_000;
/**
 * 초기 요청 재시도 대상 상태코드 — 일시적 장애(과부하·게이트웨이·프로바이더 순단).
 * 401/402/403(인증·한도)은 재시도해도 결과가 같아 제외한다.
 */
const TRANSIENT_STATUSES = new Set([429, 500, 502, 503, 504]);
/** 일시적 오류 시 초기 요청 최대 재시도 횟수 (스트리밍 시작 전이라 중복 과금 없음) */
const MAX_TRANSIENT_RETRIES = 2;
/** 재시도 지수 백오프 기준 지연(ms). attempt번째 대기 = BASE * 2**attempt. */
const RETRY_BASE_DELAY_MS = 500;

/** ms만큼 대기하되 signal이 abort되면 즉시 종료. 정상 완료=true, 취소=false. */
function sleepAbortable(ms: number, signal?: AbortSignal): Promise<boolean> {
  if (signal?.aborted) return Promise.resolve(false);
  return new Promise((resolve) => {
    const onAbort = () => {
      clearTimeout(timer);
      resolve(false);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve(true);
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * 프록시(ai-proxy)의 구조화된 에러 응답을 사용자 친화적 한국어 메시지로 변환.
 * 프록시는 `{ error: '<code>', ... }` JSON을 상태코드와 함께 반환한다(index.ts 참고).
 * 매핑 안 되는 경우는 상태코드만 노출(내부 상세는 감춤).
 */
export function friendlyProxyError(status: number, body: string): string {
  let code: string | undefined;
  try {
    code = JSON.parse(body)?.error;
  } catch {
    /* 비 JSON 응답 */
  }
  switch (code) {
    case 'quota_exceeded':
      return '이번 달 AI 사용 한도를 모두 사용했어요. 다음 달에 다시 이용하실 수 있어요.';
    case 'daily_limit':
      return '오늘 사용할 수 있는 AI 요청을 모두 사용했어요. 내일 다시 이용해 주세요.';
    case 'rate_limited':
      return 'AI 요청이 잠깐 몰렸어요. 잠시 후 다시 시도해 주세요.';
    case 'unauthorized':
      return '로그인이 만료됐어요. 다시 로그인한 뒤 시도해 주세요.';
    case 'openrouter_not_configured':
      return 'AI 서비스가 아직 준비되지 않았어요. 잠시 후 다시 시도해 주세요.';
    case 'openrouter_error':
      return 'AI 서비스가 일시적으로 응답하지 못했어요. 잠시 후 다시 시도해 주세요.';
  }
  if (status === 401 || status === 403) return '로그인이 만료됐어요. 다시 로그인한 뒤 시도해 주세요.';
  if (status === 429) return 'AI 요청이 너무 많아요. 잠시 후 다시 시도해 주세요.';
  if (status >= 500) return 'AI 서비스에 일시적인 문제가 생겼어요. 잠시 후 다시 시도해 주세요.';
  return `AI 요청에 실패했어요 (오류 ${status}). 잠시 후 다시 시도해 주세요.`;
}

/** 프록시 usage 액션이 반환하는 이번 달 사용량 요약 (logic.ts summarizeUsage와 동일 shape). */
export interface UsageSummary {
  used: number;
  cap: number;
  scope: 'org' | 'user';
  percent: number;
  remaining: number | null;
  level: 'none' | 'warn' | 'exceeded';
}

/**
 * 이번 달 AI 사용량을 프록시에서 조회. 채팅 없이 usage 액션만 호출하므로 토큰을 소비하지 않는다.
 * 실패(오프라인·미로그인·프록시 오류)는 조용히 null — 사용량 표시는 부가 정보라 UI를 막지 않는다.
 */
export async function fetchUsageSummary(opts: {
  proxyUrl: string;
  getAccessToken: () => string | null | Promise<string | null>;
}): Promise<UsageSummary | null> {
  let token: string | null = null;
  try {
    token = await opts.getAccessToken();
  } catch {
    token = null;
  }
  if (!token) return null;
  const resp = await fetch(opts.proxyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action: 'usage' }),
  }).catch(() => null);
  if (!resp || !resp.ok) return null;
  return (await resp.json().catch(() => null)) as UsageSummary | null;
}

export interface OpenRouterRuntimeOptions {
  /** Supabase Edge Function(ai-proxy) 전체 URL */
  proxyUrl: string;
  /** 현재 Supabase 액세스 토큰을 반환 (요청마다 갱신될 수 있어 함수로 받음) */
  getAccessToken: () => string | null | Promise<string | null>;
  /** A/B용 모델 오버라이드 (미지정 시 프록시 기본 모델 사용) */
  model?: string;
  /** PII 토큰화 볼트 (지정 시 모델엔 토큰, UI엔 실명). 클라우드 전송 개인정보 보호. */
  vault?: PiiVault;
}

export function createOpenRouterRuntime(opts: OpenRouterRuntimeOptions): LlamaRuntime {
  return {
    async load() {
      // 원격 호출이라 로드/스폰 없음.
    },

    async chat(messages, tools, onEvent, onToolCall, signal) {
      const startedAt = Date.now();
      let tokens = 0;

      const oaiTools = tools.map((t: ToolDefinition) => ({
        type: 'function' as const,
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }));

      const oaiMessages: any[] = messages.map((m) => ({ role: m.role, content: m.content }));

      let accessToken: string | null = null;
      try {
        accessToken = await opts.getAccessToken();
      } catch {
        accessToken = null;
      }
      if (!accessToken) {
        onEvent({ type: 'error', message: '로그인이 필요합니다. 다시 로그인 후 시도해 주세요.' });
        onEvent({ type: 'done' });
        return;
      }

      // H3: 모델 출력(토큰)을 UI에 실명으로 복원하는 스트리밍 복원기 (조각 경계 안전).
      const streamDetok = opts.vault ? opts.vault.createStreamDetokenizer() : null;

      let toolRounds = 0;
      let continuations = 0;
      // length로 잘려 이어쓰기 중일 때 부분 응답을 누적하는 단일 assistant 메시지.
      let contAssistant: { role: string; content: string } | null = null;

      while (true) {
        let assistantText = '';
        const toolCalls: { id: string; name: string; args: string }[] = [];
        let finishReason: string | null = null;

        onEvent({ type: 'usage', usage: { promptTokens: 0, ctxSize: NOMINAL_CTX_SIZE } });

        // 클라우드 백엔드는 온라인 전용 — fetch 자체가 실패하면(오프라인/DNS/프록시 다운)
        // 일반 오류 대신 인터넷 연결 안내를 준다(로컬과 달리 네트워크가 필수).
        // 초기 요청은 아직 어떤 토큰도 스트리밍되기 전이라 안전하게 재시도할 수 있다
        // (중간에 끊긴 게 아니므로 중복 출력·중복 과금 없음). 일시적 오류(네트워크·429·5xx)만
        // 짧은 백오프로 재시도하고, 인증/한도 오류는 즉시 친화 메시지로 종료한다.
        let resp: Response | null = null;
        let outcome: 'ok' | 'aborted' | 'network' | 'http' = 'network';
        for (let attempt = 0; ; attempt++) {
          let networkError = false;
          const r = await fetch(opts.proxyUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
              model: opts.model, // 미지정이면 프록시 기본 모델
              messages: oaiMessages,
              tools: oaiTools,
              tool_choice: 'auto',
              stream: true,
              stream_options: { include_usage: true },
              max_tokens: MAX_OUTPUT_TOKENS,
              temperature: 0.3,
            }),
            signal,
          }).catch(() => {
            if (!signal?.aborted) networkError = true;
            return null;
          });

          if (signal?.aborted) { outcome = 'aborted'; break; }
          if (!networkError && r && r.ok && r.body) { resp = r; outcome = 'ok'; break; }

          // 일시적 오류면 남은 재시도 횟수 안에서 백오프 후 다시 시도.
          const transient = networkError || (r != null && TRANSIENT_STATUSES.has(r.status));
          if (transient && attempt < MAX_TRANSIENT_RETRIES) {
            // 서버가 Retry-After(초)를 주면 존중(상한 10s), 아니면 지수 백오프.
            const retryAfter = Number(r?.headers?.get?.('retry-after'));
            const waitMs =
              retryAfter > 0 ? Math.min(retryAfter * 1000, 10_000) : RETRY_BASE_DELAY_MS * 2 ** attempt;
            const completed = await sleepAbortable(waitMs, signal);
            if (!completed) { outcome = 'aborted'; break; } // 대기 중 취소
            continue;
          }

          // 재시도 소진 또는 비일시적 오류 — 종류에 맞는 종료 사유 확정.
          if (networkError || !r) { outcome = 'network'; break; }
          resp = r; // 상태 오류 → 아래에서 friendlyProxyError로 안내
          outcome = 'http';
          break;
        }

        if (outcome === 'aborted') {
          onEvent({ type: 'error', message: '취소됨' });
          break;
        }
        if (outcome === 'network') {
          onEvent({ type: 'error', message: 'AI 서버에 연결하지 못했어요. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.' });
          break;
        }
        if (outcome === 'http' || !resp || !resp.body) {
          const errText = resp ? await resp.text().catch(() => '') : '';
          onEvent({ type: 'error', message: friendlyProxyError(resp?.status ?? 0, errText) });
          break;
        }

        const reader = resp.body.getReader();
        const dec = new TextDecoder();
        let buf = '';
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            if (data === '[DONE]') break;
            try {
              const ev = JSON.parse(data);
              const delta = ev.choices?.[0]?.delta;
              if (delta?.content) {
                tokens++;
                assistantText += delta.content; // 모델 컨텍스트용(토큰 유지)
                // H3: UI에는 실명으로 복원해 스트리밍
                const shown = streamDetok ? streamDetok.push(delta.content) : delta.content;
                if (shown) onEvent({ type: 'token', token: shown });
              }
              if (delta?.tool_calls) {
                for (const tc of delta.tool_calls) {
                  const idx = tc.index ?? 0;
                  if (!toolCalls[idx]) {
                    toolCalls[idx] = { id: tc.id ?? `call_${idx}`, name: tc.function?.name ?? '', args: '' };
                  }
                  if (tc.function?.name) toolCalls[idx].name = tc.function.name;
                  if (tc.function?.arguments) toolCalls[idx].args += tc.function.arguments;
                }
              }
              if (ev.usage?.prompt_tokens) {
                onEvent({ type: 'usage', usage: { promptTokens: ev.usage.prompt_tokens, ctxSize: NOMINAL_CTX_SIZE } });
              }
              if (ev.choices?.[0]?.finish_reason) finishReason = ev.choices[0].finish_reason;
            } catch {
              /* malformed chunk */
            }
          }
        }

        if (toolCalls.length === 0) {
          // length로 잘렸으면 조용히 끝내지 말고 이어서 생성 (부분 응답을 단일 assistant에 누적).
          if (finishReason === 'length' && continuations < MAX_CONTINUATIONS) {
            if (contAssistant) {
              contAssistant.content += assistantText;
            } else {
              contAssistant = { role: 'assistant', content: assistantText };
              oaiMessages.push(contAssistant);
            }
            continuations++;
            continue;
          }
          break; // 정상 종료 또는 이어쓰기 한도 도달
        }

        if (toolRounds >= MAX_TOOL_ROUNDS) break;
        toolRounds++;

        oaiMessages.push({
          role: 'assistant',
          content: assistantText || null,
          tool_calls: toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function',
            function: { name: tc.name, arguments: tc.args },
          })),
        });

        for (const tc of toolCalls) {
          let parsedArgs: unknown;
          try { parsedArgs = JSON.parse(tc.args || '{}'); } catch { parsedArgs = {}; }
          // H2: 모델이 넘긴 토큰 인자를 실제 값으로 복원 후 실행/표시
          if (opts.vault) parsedArgs = opts.vault.detokenizeObject(parsedArgs);
          onEvent({ type: 'tool_call', toolCall: { id: tc.id, name: tc.name, args: parsedArgs } });
          const result = await onToolCall(tc.name, parsedArgs);
          onEvent({ type: 'tool_result', toolResult: result }); // UI엔 실명(원본)
          // H1: 모델 컨텍스트로 들어가는 사본만 토큰화 (실명이 클라우드로 안 나감)
          const modelResult = opts.vault ? opts.vault.tokenizeObject(result) : result;
          let resultStr = JSON.stringify(modelResult);
          if (resultStr.length > MAX_TOOL_RESULT_CHARS) {
            resultStr =
              resultStr.slice(0, MAX_TOOL_RESULT_CHARS) +
              '\n…(결과가 너무 많아 일부만 표시됨. 이름·전화 등으로 더 좁혀서 검색하세요)';
          }
          oaiMessages.push({ role: 'tool', tool_call_id: tc.id, content: resultStr });
        }
      }

      // H3: 복원기 버퍼에 남은(보류된) 마지막 조각 방출
      if (streamDetok) {
        const tail = streamDetok.flush();
        if (tail) onEvent({ type: 'token', token: tail });
      }

      onEvent({ type: 'done' });
      console.log(`[OpenRouterRuntime] chat 완료 — ${Date.now() - startedAt}ms, ${tokens} tokens`);
    },

    async resetSession() {
      // stateless 호출이라 세션 없음 — 호출자가 messages 관리. no-op.
    },

    async unload() {
      // 원격이라 정리할 프로세스 없음.
    },
  };
}
