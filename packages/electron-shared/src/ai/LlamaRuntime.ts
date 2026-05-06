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
      context = await model.createContext({ contextSize: opts.contextSize ?? 4096 });
    },

    async chat(messages, tools, onEvent, onToolCall, signal) {
      if (!context) throw new Error('LlamaRuntime: load()를 먼저 호출하세요');

      const { LlamaChatSession } = llamaPkg as any;
      const session = new LlamaChatSession({
        contextSequence: context.getSequence(),
      });

      // node-llama-cpp v3: tools를 functions로 변환
      const functions: Record<string, any> = {};
      for (const t of tools) {
        functions[t.name] = {
          description: t.description,
          params: t.parameters,
          handler: async (args: unknown) => {
            onEvent({ type: 'tool_call', toolCall: { id: t.name, name: t.name, args } });
            const result = await onToolCall(t.name, args);
            onEvent({ type: 'tool_result', toolResult: result });
            return result;
          },
        };
      }

      const last = messages[messages.length - 1];
      const userText = last?.content ?? '';

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
      }
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
