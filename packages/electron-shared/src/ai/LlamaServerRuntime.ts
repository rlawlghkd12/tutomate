/**
 * llama-server (llama.cpp의 OpenAI 호환 서버) 백엔드 LlamaRuntime 구현.
 *
 * node-llama-cpp 대비 장점:
 * - Qwen 3.5의 jinja chat template 정확 적용 (--jinja)
 * - tool calling이 OpenAI 표준 (안정적)
 * - thinking 토큰 자동 처리
 * - 시퀀스 풀 같은 내부 자원 issue 없음
 *
 * 동작:
 * - 인스턴스 별 자체 llama-server 프로세스를 spawn (lazy)
 * - 첫 chat() 호출 시 시작, unload()에서 종료
 * - 모든 chat() 호출이 같은 프로세스로 라우팅됨 (모델 reload 없음 → 빠름)
 */

import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import net from 'node:net';
import type { ToolDefinition } from '@tutomate/core';
import type { LlamaRuntime, LlamaRuntimeOptions } from './LlamaRuntime';
import { findLlamaServerBin } from './llamaServerBin';

/**
 * Windows에서 비ASCII(한글 등) 사용자명 경로는 spawn 인자로 그대로 넘기면
 * llama-server(C++)가 ANSI argv로 받아 fopen에서 "No such file or directory"로 실패한다.
 * NTFS의 8.3 단축 경로(`통도예~1` 같은 ASCII alias)로 변환해서 넘기면 모든 코드페이지에서 동일하게 동작.
 *
 * - 이미 ASCII면 변환 시도 없이 원본 반환 (PowerShell 호출 비용 절약)
 * - 단축 경로가 결국 ASCII가 아니거나 변환 실패면 원본 그대로 (폴백, 개선 효과 없음)
 */
function toShortPathIfNeeded(longPath: string): string {
  if (process.platform !== 'win32') return longPath;
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]+$/.test(longPath)) return longPath;
  try {
    const esc = longPath.replace(/'/g, "''");
    const psCmd =
      `$fso = New-Object -ComObject Scripting.FileSystemObject; ` +
      `if (Test-Path -LiteralPath '${esc}' -PathType Leaf) { Write-Output $fso.GetFile('${esc}').ShortPath } ` +
      `elseif (Test-Path -LiteralPath '${esc}' -PathType Container) { Write-Output $fso.GetFolder('${esc}').ShortPath }`;
    const r = spawnSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', psCmd],
      { encoding: 'utf-8', windowsHide: true },
    );
    const out = (r.stdout ?? '').trim();
    // eslint-disable-next-line no-control-regex
    if (out && /^[\x00-\x7F]+$/.test(out)) {
      console.log('[LlamaServerRuntime] 비ASCII 경로 → 단축경로 변환:', longPath, '→', out);
      return out;
    }
    console.warn(
      '[LlamaServerRuntime] 단축경로 변환 실패 또는 ASCII 결과 아님 — 원본 사용:',
      longPath,
      '→',
      out || '(빈 결과)',
    );
    return longPath;
  } catch (e) {
    console.warn('[LlamaServerRuntime] 단축경로 변환 예외:', e);
    return longPath;
  }
}

/** 도구 호출 라운드 한도 (무한 루프 방지) */
const MAX_TOOL_ROUNDS = 5;
/** 답변이 출력 한도(length)로 잘렸을 때 자동으로 이어쓰기 할 최대 횟수 */
const MAX_CONTINUATIONS = 3;
/** 서버 health check 타임아웃 */
const READY_TIMEOUT_MS = 90_000;
/** 응답에 예약할 출력 토큰 */
const MAX_OUTPUT_TOKENS = 2048;
/** 컨텍스트 추정 오차/템플릿(jinja) 오버헤드용 여유분 */
const CONTEXT_SAFETY_TOKENS = 1024;
/** 단일 도구 결과를 컨텍스트에 넣을 때 최대 글자수 (초과 시 잘라냄) */
const MAX_TOOL_RESULT_CHARS = 4000;
/** 트림 시 도구 결과를 잘라낼 최소 보존 글자수 */
const MIN_TOOL_RESULT_CHARS = 400;

/**
 * 토큰 수 추정. 정확한 토크나이저 대신 컨텍스트 트림 판단용 *보수적*(=많게) 추정.
 * 과소평가하면 실제 프롬프트가 n_ctx를 넘겨 답변이 중간에 잘리므로 일부러 넉넉히 잡는다.
 * Qwen BBPE 기준 한글은 글자당 1토큰을 넘는 경우가 많아 1.3배, ASCII는 3글자/토큰으로 가정.
 */
function estimateTokens(s?: string): number {
  if (!s) return 0;
  let cjk = 0;
  let other = 0;
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0;
    if ((code >= 0x3000 && code <= 0x9fff) || (code >= 0xac00 && code <= 0xd7af)) cjk++;
    else other++;
  }
  return Math.ceil(cjk * 1.3 + other / 3);
}

interface ServerOptions extends LlamaRuntimeOptions {
  /** llama-server 실행 파일 직접 지정 (없으면 자동 탐색) */
  binPath?: string;
  /** electron app.getPath('userData') */
  userDataDir: string;
  /** electron resourcesPath (production) */
  resourcesPath?: string;
  /** GPU 레이어 수 (-1=자동, 0=CPU만, 99=가능한 모두) */
  gpuLayers?: number;
}

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close((err) => (err ? reject(err) : resolve(port)));
    });
    srv.on('error', reject);
  });
}

export async function createLlamaServerRuntime(opts: ServerOptions): Promise<LlamaRuntime> {
  const binPath = opts.binPath ?? findLlamaServerBin(opts.userDataDir, opts.resourcesPath);
  if (!binPath) {
    throw new Error(
      'llama-server 실행 파일을 찾을 수 없습니다. 개발: `brew install llama.cpp`. 배포: 다운로드 필요.',
    );
  }
  console.log('[LlamaServerRuntime] using bin:', binPath);

  let proc: ChildProcess | null = null;
  let port = 0;

  async function ensureServer(): Promise<void> {
    if (proc && !proc.killed) return;
    port = await getFreePort();
    // Windows 한글 사용자명 경로(예: C:\Users\통도예술마을협동조합\...) 대응 —
    // llama-server에 인자로 넘기는 모든 경로를 가능하면 ASCII 단축경로로 바꿔서 fopen 실패를 막는다.
    const binPathArg = toShortPathIfNeeded(binPath!);
    const modelPathArg = toShortPathIfNeeded(opts.modelPath);
    const args = [
      '-m', modelPathArg,
      '--port', String(port),
      '--host', '127.0.0.1',
      '-c', String(opts.contextSize ?? 8192),
      '--jinja',
      '-ngl', String(opts.gpuLayers ?? 99),
      '--no-warmup',
      // Flash attention — prefill/decode 속도 개선, 메모리 사용량도 같이 감소.
      // 저사양(8GB) 사용자 체감 응답 빠르게 하는 가장 큰 단일 ROI.
      // llama.cpp 최근 빌드부터 `-fa`가 on|off|auto 값을 받는 구문으로 바뀌어
      // 값을 명시하지 않으면 다음 인자(--cache-type-k)를 값으로 해석해 기동 실패한다.
      '-fa', 'on',
      // KV 캐시를 q8_0으로 양자화 → KV 메모리 절반. -fa가 켜져 있어야 v도 양자화 가능.
      // 품질 손실은 거의 측정 불가 수준이라 default로 켠다.
      '--cache-type-k', 'q8_0',
      '--cache-type-v', 'q8_0',
      // --log-disable 제거: 기동 실패(모델 로드 등) 사유가 stderr로 나와야 진단 가능.
      // (이 로그는 비정상 종료 시 에러 메시지에 첨부됨)
    ];
    console.log('[LlamaServerRuntime] spawn:', binPathArg, args.join(' '));
    proc = spawn(binPathArg, args, { stdio: ['ignore', 'pipe', 'pipe'] });

    // 크래시 원인 파악용 — stderr/stdout 마지막 줄들을 보관해 에러에 첨부
    let logTail = '';
    const keepTail = (s: string) => {
      logTail = (logTail + s + '\n').slice(-3000);
    };
    proc.stdout?.on('data', (d) => {
      const s = d.toString().trim();
      if (s) { console.log('[llama-server]', s); keepTail(s); }
    });
    proc.stderr?.on('data', (d) => {
      const s = d.toString().trim();
      if (s) { console.error('[llama-server]', s); keepTail(s); }
    });

    // ready 대기 (health endpoint)
    const start = Date.now();
    while (Date.now() - start < READY_TIMEOUT_MS) {
      try {
        const r = await fetch(`http://127.0.0.1:${port}/health`);
        if (r.ok) {
          console.log(`[LlamaServerRuntime] ready on port ${port} (${Date.now() - start}ms)`);
          return;
        }
      } catch {
        /* still starting */
      }
      if (proc.exitCode !== null) {
        const detail = logTail.trim();
        // 비ASCII(한글 등) 사용자명 경로 + "No such file or directory" 패턴이면
        // 단축경로 변환 폴백이 작동 못 한 케이스(8.3 비활성 NTFS / PowerShell 차단 등) —
        // 기술 메시지 대신 친화 안내로 대체. error_logs에는 자동으로 캡처됨(aiChatStore).
        // eslint-disable-next-line no-control-regex
        const isNonAsciiPath = /[^\x00-\x7F]/.test(opts.modelPath);
        const isFileNotFound = /no such file or directory/i.test(detail);
        if (isNonAsciiPath && isFileNotFound) {
          throw new Error(
            'AI 엔진이 모델 파일을 못 읽고 있어요. ' +
              '사용자 계정 이름에 한글 같은 비영어 문자가 들어있을 때 일부 PC에서 ' +
              '생기는 문제입니다. 영문 사용자 계정에서 다시 시도하시거나 고객센터에 문의해 주세요.\n\n' +
              `[엔진 로그]\n${detail}`,
          );
        }
        throw new Error(
          `llama-server 비정상 종료 (code ${proc.exitCode})` +
            (detail ? `\n\n[엔진 로그]\n${detail}` : ''),
        );
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error('llama-server 기동 타임아웃 (90s)');
  }

  return {
    async load() {
      // server 자체 spawn은 첫 chat()에서 lazy. 여기선 binary 검증만.
      // (모델 로드는 server 안에서 자동 — 직접 트리거하려면 spawn 즉시)
      // 현재 컨벤션: load=binary 확인, chat=lazy spawn
    },

    async chat(messages, tools, onEvent, onToolCall, signal) {
      const startedAt = Date.now();
      let firstTokenAt = 0;
      let tokens = 0;

      try {
        await ensureServer();
      } catch (e: any) {
        onEvent({ type: 'error', message: e?.message ?? '서버 기동 실패' });
        onEvent({ type: 'done' });
        return;
      }

      // OpenAI 호환 tools 형식
      const oaiTools = tools.map((t: ToolDefinition) => ({
        type: 'function' as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));

      // ChatMessage[] → OpenAI messages[]
      const oaiMessages: any[] = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      // ── 컨텍스트 예산 ──
      // 시스템 프롬프트 + 도구 정의는 못 줄이므로(도구 호출에 필수), 초과 시 대화/도구 결과를 트림한다.
      // 출력 토큰·safety 마진은 컨텍스트가 작을 때(저사양 8GB → 4096) 비례로 줄여
      // inputBudget이 음수가 되지 않도록 한다.
      const ctxSize = opts.contextSize ?? 8192;
      const toolsTokens = estimateTokens(JSON.stringify(oaiTools));
      const reservedOutput = Math.min(MAX_OUTPUT_TOKENS, Math.floor(ctxSize / 4));
      const safety = Math.min(CONTEXT_SAFETY_TOKENS, Math.floor(ctxSize / 16));
      const inputBudget = Math.max(512, ctxSize - reservedOutput - safety - toolsTokens);

      const msgTokens = (m: any) =>
        estimateTokens(typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? '')) + 4;
      const totalTokens = () => oaiMessages.reduce((n, m) => n + msgTokens(m), 0);

      /** 모델 전송 직전, 예산 초과 시 도구 결과 → 오래된 대화 순으로 잘라낸다. */
      const fitContext = () => {
        if (totalTokens() <= inputBudget) return;
        // 1) 큰 도구 결과부터 잘라냄 (가장 긴 것 우선)
        const toolIdxByLen = oaiMessages
          .map((m, i) => ({ i, len: typeof m.content === 'string' ? m.content.length : 0, role: m.role }))
          .filter((x) => x.role === 'tool' && x.len > MIN_TOOL_RESULT_CHARS)
          .sort((a, b) => b.len - a.len);
        for (const { i } of toolIdxByLen) {
          if (totalTokens() <= inputBudget) break;
          const content = oaiMessages[i].content as string;
          oaiMessages[i].content =
            content.slice(0, MIN_TOOL_RESULT_CHARS) + '\n…(결과가 많아 일부 생략 — 컨텍스트 한도)';
        }
        // 2) 그래도 초과면 오래된 대화부터 제거 (system[0]·마지막 메시지 보존, tool_call 쌍 유지)
        while (totalTokens() > inputBudget && oaiMessages.length > 2) {
          const idx = oaiMessages[0]?.role === 'system' ? 1 : 0;
          if (idx >= oaiMessages.length - 1) break; // 마지막 메시지는 보존
          const removed = oaiMessages.splice(idx, 1)[0];
          // assistant(tool_calls) 제거 시 짝지어진 tool 메시지도 함께 제거
          if (removed?.tool_calls) {
            while (oaiMessages[idx]?.role === 'tool') oaiMessages.splice(idx, 1);
          }
        }
        console.warn(`[LlamaServerRuntime] 컨텍스트 트림 적용 — 예상 ${totalTokens()}/${inputBudget} 토큰`);
      };

      let toolRounds = 0;
      let continuations = 0;
      // length로 잘려 이어쓰기 중일 때, 부분 응답을 누적하는 단일 assistant 메시지.
      // (여러 개로 쪼개 push하면 llama.cpp가 prefill 이어쓰기로 인식 못 함)
      let contAssistant: { role: string; content: string } | null = null;
      while (true) {
        fitContext();

        let assistantText = '';
        const toolCalls: { id: string; name: string; args: string }[] = [];
        let finishReason: string | null = null;

        // 실제 남은 공간에 맞춰 출력 토큰을 동적으로 잡는다.
        // 고정 2048은 프롬프트가 커지면 n_ctx를 넘겨 답변이 중간에 잘리는 원인.
        // 컨텍스트가 작으면(저사양 4096) 최소 보장도 함께 낮춰 답변이 잘리는 비율을 줄인다.
        const promptTokens = totalTokens() + toolsTokens;
        const minOutput = Math.min(256, Math.floor(ctxSize / 16));
        const maxTokens = Math.max(
          minOutput,
          Math.min(reservedOutput, ctxSize - promptTokens - safety),
        );

        // 컨텍스트 사용량을 UI에 보고 (대화가 얼마나 찼는지 퍼센트 표시용)
        onEvent({ type: 'usage', usage: { promptTokens, ctxSize } });

        const resp = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: oaiMessages,
            tools: oaiTools,
            tool_choice: 'auto',
            stream: true,
            max_tokens: maxTokens,
            temperature: 0.3,
          }),
          signal,
        }).catch((e) => {
          if (signal?.aborted) return null;
          throw e;
        });

        if (signal?.aborted) {
          onEvent({ type: 'error', message: '취소됨' });
          break;
        }
        if (!resp) break;
        if (!resp.ok || !resp.body) {
          const errText = await resp.text().catch(() => '');
          onEvent({
            type: 'error',
            message: `LLM API ${resp.status}: ${errText.slice(0, 200)}`,
          });
          break;
        }

        // SSE 파싱
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
                if (!firstTokenAt) firstTokenAt = Date.now();
                tokens++;
                assistantText += delta.content;
                onEvent({ type: 'token', token: delta.content });
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
              if (ev.choices?.[0]?.finish_reason) finishReason = ev.choices[0].finish_reason;
            } catch {
              /* malformed chunk */
            }
          }
        }

        if (finishReason === 'length') {
          console.warn(
            `[LlamaServerRuntime] 답변이 출력 한도(max_tokens=${maxTokens})에서 잘림 — ` +
              `프롬프트 ≈ ${promptTokens}/${ctxSize} 토큰. 대화가 길어 컨텍스트가 부족합니다.`,
          );
        }

        if (toolCalls.length === 0) {
          // length로 잘렸으면 조용히 끝내지 말고 이어서 생성한다.
          // llama.cpp(--jinja)는 마지막 메시지가 assistant면 새 턴을 열지 않고
          // 그 내용에 이어서 생성(prefill)하므로, 부분 응답을 넣고 재요청하면
          // 같은 답변이 이어지고 UI 말풍선에도 자연스럽게 이어붙는다.
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
          // 정상 종료 (또는 이어쓰기 한도 도달)
          break;
        }

        // 도구 호출 라운드 한도 체크 (무한 루프 방지)
        if (toolRounds >= MAX_TOOL_ROUNDS) break;
        toolRounds++;

        // 도구 호출 실행 + assistant + tool 메시지 추가
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
          onEvent({
            type: 'tool_call',
            toolCall: { id: tc.id, name: tc.name, args: parsedArgs },
          });
          const result = await onToolCall(tc.name, parsedArgs);
          onEvent({ type: 'tool_result', toolResult: result });
          let resultStr = JSON.stringify(result);
          if (resultStr.length > MAX_TOOL_RESULT_CHARS) {
            resultStr =
              resultStr.slice(0, MAX_TOOL_RESULT_CHARS) +
              '\n…(결과가 너무 많아 일부만 표시됨. 이름·전화 등으로 더 좁혀서 검색하세요)';
          }
          oaiMessages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: resultStr,
          });
        }
      }

      onEvent({ type: 'done' });
      console.log(
        `[LlamaServerRuntime] chat 완료 — ${Date.now() - startedAt}ms, ${tokens} tokens`,
      );
      void firstTokenAt; // 향후 메트릭용
    },

    async resetSession() {
      // llama-server는 stateless 호출이라 세션 자체가 없음 — 호출자가 messages 관리.
      // 의미 있게 만들려면 caller가 새 messages[] 넘기면 됨. no-op.
    },

    async unload() {
      if (proc && !proc.killed) {
        console.log('[LlamaServerRuntime] terminating server pid', proc.pid);
        try {
          proc.kill('SIGTERM');
        } catch (e) {
          console.warn('[LlamaServerRuntime] kill failed:', e);
        }
        proc = null;
      }
    },
  };
}
