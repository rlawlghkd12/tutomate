import type { z } from 'zod';
import type { BankDepositPreviewItem } from './bank/depositMatcher';

// ─── 챗 메시지 / 도구 정의 ─────────────────────────────────────

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
  attachments?: { fileId: string; name: string }[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: object; // JSON Schema (zod-to-json-schema 변환 결과)
}

export interface ToolCall {
  id: string;
  name: string;
  args: unknown;
}

// ─── 스마트 카드 (메시지에 부착되는 UI 메타) ──────────────────

export type SmartCard =
  | { type: 'mappingError'; matched: string[]; unmatched: string[] }
  | {
      type: 'importPreview';
      fileId: string;
      mapping: Record<string, string>;
      rows: { data: Record<string, unknown>; errors: string[] }[];
      total: number;
      errorRows: number;
      kind: 'students' | 'payments';
    }
  | { type: 'importResult'; added: number; duplicated: number; errors: number }
  | {
      type: 'bankDepositPreview';
      fileId: string;
      summary: {
        total: number;
        auto: number;
        needsConfirm: number;
        unmatched: number;
        /** 등록이 없어 새로 등록 후 저장 제안하는 건 수 */
        needsEnrollment: number;
        /** 여러 강의 합산 입금으로 나눠 저장 제안하는 건 수 */
        needsSplit: number;
        /** 기존 결제와 등록·날짜·금액이 겹치는 건 수 (저장 후보 중) */
        duplicate: number;
        accountName?: string;
        period?: string;
      };
      items: BankDepositPreviewItem[];
    }
  | {
      type: 'bankDepositResult';
      saved: number;
      skipped: number;
      failed: number;
      /** 새로 등록(enrollment)을 만든 건 수 */
      enrolled?: number;
    }
  | { type: 'sourceLink'; kind: string; id: string; label: string };

// ─── chat 스트림 이벤트 ──────────────────────────────────────

export interface ChatStreamEvent {
  type: 'token' | 'tool_call' | 'tool_result' | 'card' | 'done' | 'error' | 'usage';
  token?: string;
  toolCall?: ToolCall;
  toolResult?: unknown;
  card?: SmartCard;
  message?: string;
  /** 컨텍스트 사용량 — usage 이벤트에서 전달 (프롬프트 추정 토큰 / 컨텍스트 윈도우) */
  usage?: { promptTokens: number; ctxSize: number };
}

// ─── 도구 핸들러 (ActionDispatcher가 실행) ────────────────────

export interface ToolContext {
  orgId: string;
  userId: string;
  fileStash?: { read(fileId: string): Promise<Uint8Array> };
  /** 도구가 UI에 카드를 푸시할 때 사용 */
  emit?: (card: SmartCard) => void;
}

export interface ToolHandler<S extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  description: string;
  schema: S;
  execute: (args: z.infer<S>, ctx: ToolContext) => Promise<unknown>;
}
