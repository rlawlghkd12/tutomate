/**
 * LlamaRuntime — 챗봇 런타임 인터페이스 (백엔드 추상화).
 *
 * 현재 구현: LlamaServerRuntime (llama.cpp의 OpenAI 호환 서버 spawn).
 * 과거 구현: node-llama-cpp 직접 사용 (제거됨 — 함수 호출 불안정 + 시퀀스 풀 이슈).
 */

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
  /** 대화 히스토리를 초기화. 구현체에 따라 no-op일 수 있음. */
  resetSession(): Promise<void>;
  unload(): Promise<void>;
}
