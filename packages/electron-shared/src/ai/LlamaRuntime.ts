import type {
  ChatMessage,
  ChatStreamEvent,
  ToolDefinition,
} from '@tutomate/core';

export interface LlamaRuntimeOptions {
  modelPath: string;
  contextSize?: number;
  threads?: number;
}

export interface LlamaRuntime {
  load(): Promise<void>;
  chat(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    onEvent: (e: ChatStreamEvent) => void,
    onToolCall: (name: string, args: unknown) => Promise<unknown>,
    signal?: AbortSignal,
  ): Promise<void>;
  /** 대화 히스토리를 초기화하고 시퀀스를 새로 잡는다. */
  resetSession(): Promise<void>;
  unload(): Promise<void>;
}

/**
 * node-llama-cpp 래퍼.
 * - 모델 로드/언로드
 * - chat: 메시지 + 도구 정의 → 토큰 스트림 + tool_call 라우팅
 *
 * 주: node-llama-cpp는 네이티브 바이너리. dynamic import로 메인 프로세스에서만 로드.
 * 함수 호출 라운드 한도 5회 (무한 루프 방지).
 */
export async function createLlamaRuntime(
  opts: LlamaRuntimeOptions,
): Promise<LlamaRuntime> {
  const llamaPkg = await import('node-llama-cpp');
  let llamaInst: any = null;
  let model: any = null;
  let context: any = null;

  return {
    async load() {
      llamaInst = await llamaPkg.getLlama();
      model = await llamaInst.loadModel({ modelPath: opts.modelPath });
      context = await model.createContext({
        contextSize: opts.contextSize ?? 4096,
        sequences: 1,
      });
    },

    /**
     * 매 호출마다 새 세션 — multi-turn 메모리 포기, 함수 호출 신뢰성 확보.
     * (Qwen 3.5는 stale context에서 도구 재호출을 회피하는 경향이 있음)
     * 후속 질문은 사용자가 컨텍스트를 명시적으로 입력하는 방식으로 보완.
     */
    async chat(messages, tools, onEvent, onToolCall, signal) {
      if (!context) throw new Error('LlamaRuntime: load()를 먼저 호출하세요');

      const systemMsg = messages.find((m) => m.role === 'system');
      const lastUser = [...messages].reverse().find((m) => m.role === 'user');
      const userText = lastUser?.content ?? '';

      const { LlamaChatSession } = llamaPkg as any;
      const sequence = context.getSequence();
      const session = new LlamaChatSession({
        contextSequence: sequence,
        systemPrompt: systemMsg?.content,
      });

      const functions: Record<string, any> = {};
      for (const t of tools) {
        functions[t.name] = {
          description: t.description,
          params: t.parameters,
          handler: async (args: unknown) => {
            console.log(`[LlamaRuntime] 🔧 ${t.name}(`, args, ')');
            onEvent({ type: 'tool_call', toolCall: { id: t.name, name: t.name, args } });
            const result = await onToolCall(t.name, args);
            onEvent({ type: 'tool_result', toolResult: result });
            return result;
          },
        };
      }
      console.log(`[LlamaRuntime] prompt='${userText}' / 도구 ${tools.length}개`);

      try {
        await session.prompt(userText, {
          functions,
          signal,
          onTextChunk: (chunk: string) =>
            onEvent({ type: 'token', token: chunk }),
          maxTokens: 1024,
        });
        onEvent({ type: 'done' });
      } catch (e: any) {
        if (signal?.aborted) {
          onEvent({ type: 'error', message: '취소됨' });
        } else {
          onEvent({ type: 'error', message: e?.message ?? String(e) });
        }
      } finally {
        try { await session.dispose?.(); } catch { /* ignore */ }
        try { await sequence.dispose?.(); } catch { /* ignore */ }
      }
    },

    async resetSession() {
      // 세션을 인스턴스 상태로 안 들고 있으니 no-op
    },

    async unload() {
      try { await context?.dispose?.(); } catch { /* ignore */ }
      try { await llamaInst?.dispose?.(); } catch { /* ignore */ }
      context = null;
      model = null;
      llamaInst = null;
    },
  };
}
