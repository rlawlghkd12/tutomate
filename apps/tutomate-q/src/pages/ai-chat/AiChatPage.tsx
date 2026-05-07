import { useEffect, useState, useCallback } from 'react';
import { useAuthStore } from '@tutomate/core';
import type { ChatMessage, SmartCard } from '@tutomate/core';
import { ChatWindow } from './components/ChatWindow';
import { ChatInput } from './components/ChatInput';
import { ModelDownloadModal } from './components/ModelDownloadModal';
import { DirectImportFallback } from './components/DirectImportFallback';
import type { DisplayMessage } from './components/MessageBubble';

type AiState = 'unknown' | 'not_installed' | 'loading_pending' | 'ready' | 'disabled';

const HISTORY_LIMIT = 200; // 메시지 최대 보존 수
const historyKey = (orgId: string) => `ai-chat-history:${orgId || 'default'}`;

function loadHistory(orgId: string): DisplayMessage[] {
  try {
    const raw = localStorage.getItem(historyKey(orgId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveHistory(orgId: string, messages: DisplayMessage[]) {
  try {
    const trimmed = messages.slice(-HISTORY_LIMIT);
    localStorage.setItem(historyKey(orgId), JSON.stringify(trimmed));
  } catch (e) {
    console.warn('[AiChatPage] history save failed:', e);
  }
}

export default function AiChatPage() {
  const orgId = useAuthStore((s) => s.organizationId ?? '');
  const userId = useAuthStore((s) => s.session?.user?.id ?? '');

  const [state, setState] = useState<AiState>('unknown');
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [streaming, setStreaming] = useState(false);

  const [statusError, setStatusError] = useState<string | null>(null);

  // 조직 변경 시 히스토리 로드
  useEffect(() => {
    setMessages(loadHistory(orgId));
  }, [orgId]);

  // 메시지 변경 시 자동 저장 (스트리밍 중 토큰마다 저장은 부담 → 한 박자 디바운스)
  useEffect(() => {
    const t = setTimeout(() => saveHistory(orgId, messages), 300);
    return () => clearTimeout(t);
  }, [messages, orgId]);

  // 진단·상태 결정
  useEffect(() => {
    (async () => {
      try {
        if (!window.electronAPI?.aiStatus) {
          throw new Error('electronAPI.aiStatus 미정의 — preload 갱신 필요');
        }
        console.log('[AiChatPage] aiStatus 호출...');
        const status = (await window.electronAPI.aiStatus()) as AiState;
        console.log('[AiChatPage] aiStatus 응답:', status);
        if (status === 'not_installed') {
          const d = await window.electronAPI.aiDiagnose();
          console.log('[AiChatPage] aiDiagnose:', d);
          if (d.recommendation === 'block') {
            setState('disabled');
            return;
          }
          setState('not_installed');
          return;
        }
        setState(status);
      } catch (e: any) {
        console.error('[AiChatPage] status check failed:', e);
        setStatusError(e?.message ?? String(e));
      }
    })();
  }, []);

  // chat 스트림 이벤트 수신 → messages 갱신
  // loading_pending도 챗 UI 노출 대상 (실 chat 호출 시 lazy load됨)
  useEffect(() => {
    if (state !== 'ready' && state !== 'loading_pending') return;
    return window.electronAPI.onAiChatEvent((e: any) => {
      if (e.type === 'token') {
        setMessages((m) => {
          const last = m[m.length - 1];
          if (last?.role === 'assistant') {
            return [
              ...m.slice(0, -1),
              { ...last, content: (last.content ?? '') + e.token },
            ];
          }
          return [...m, { role: 'assistant', content: e.token }];
        });
      } else if (e.type === 'card') {
        setMessages((m) => {
          const last = m[m.length - 1];
          if (last?.role === 'assistant') {
            const cards = [...(last.cards ?? []), e.card as SmartCard];
            return [...m.slice(0, -1), { ...last, cards }];
          }
          return [...m, { role: 'assistant', content: '', cards: [e.card] }];
        });
      } else if (e.type === 'error') {
        // 에러를 채팅에 시스템 메시지로 표시
        setMessages((m) => [
          ...m,
          { role: 'assistant', content: `⚠️ ${e.message ?? '알 수 없는 오류'}` },
        ]);
        setStreaming(false);
      } else if (e.type === 'done') {
        setStreaming(false);
      }
    });
  }, [state]);

  const handleSend = useCallback(
    async (text: string, attachment?: { fileId: string; name: string }) => {
      const userMsg: ChatMessage = {
        role: 'user',
        content: text,
        attachments: attachment
          ? [{ fileId: attachment.fileId, name: attachment.name }]
          : undefined,
      };
      const next = [...messages, userMsg];
      setMessages(next);
      setStreaming(true);

      // 첨부 파일이 있으면 LLM에게 fileId 힌트 추가
      const messagesForLlm = attachment
        ? [...next, {
            role: 'system' as const,
            content: `사용자가 엑셀 파일을 첨부했습니다. fileId="${attachment.fileId}". 적절한 도구(parseExcelHeaders, mapColumns, previewImport)를 호출해주세요.`,
          }]
        : next;

      await window.electronAPI.aiChat({
        messages: messagesForLlm,
        orgId,
        userId,
      });
    },
    [messages, orgId, userId],
  );

  const handleConfirmPreview = useCallback(
    (card: Extract<SmartCard, { type: 'importPreview' }>) => {
      // confirmImport는 LLM에 추가 prompt로 위임 (간단·결정론)
      handleSend(
        `확정해주세요. fileId="${card.fileId}" mapping=${JSON.stringify(card.mapping)} kind="${card.kind}"`,
      );
    },
    [handleSend],
  );

  const handleCancelPreview = useCallback(() => {
    setMessages((m) => [
      ...m,
      { role: 'assistant', content: '취소했습니다.' },
    ]);
  }, []);

  // 진단 실패 시 에러 표시 (조용히 멈추지 않게)
  if (statusError) {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <h1 className="text-xl font-bold mb-3">AI 어시스턴트 준비 실패</h1>
        <pre className="bg-red-50 text-red-700 p-3 rounded text-sm whitespace-pre-wrap">{statusError}</pre>
        <p className="mt-4 text-sm text-gray-600">
          앱을 완전히 종료한 후 다시 실행해주세요. (개발 중이라면 electron 재시작 필요 — Vite 새로고침으로는 main 프로세스 변경이 반영되지 않습니다.)
        </p>
      </div>
    );
  }

  // unknown: 메인 프로세스 status 응답 대기 중 (initial check)
  if (state === 'unknown') {
    return <div className="p-8 text-center">준비 중…</div>;
  }
  if (state === 'not_installed') {
    return (
      <ModelDownloadModal
        onInstalled={() => setState('ready')}
        onSkip={() => setState('disabled')}
      />
    );
  }
  if (state === 'disabled') {
    return <DirectImportFallback />;
  }
  // 'loading_pending'은 모델 설치 완료 + runtime 미로드 상태.
  // 첫 chat 호출 시 메인이 lazy load 하므로 chat UI 노출.

  const handleNewChat = useCallback(() => {
    if (streaming) return;
    if (messages.length > 0 && !confirm('대화를 새로 시작할까요? 지금까지의 내용은 사라집니다.')) return;
    setMessages([]);
    saveHistory(orgId, []);
    window.electronAPI.aiResetSession?.().catch(() => undefined);
  }, [orgId, messages.length, streaming]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-background">
        <div className="text-sm text-muted-foreground">
          {messages.length > 0 ? `대화 ${messages.length}개` : '새 대화'}
        </div>
        <button
          onClick={handleNewChat}
          disabled={streaming || messages.length === 0}
          className="text-sm px-3 py-1 rounded border border-border hover:bg-accent disabled:opacity-50"
        >
          새 대화
        </button>
      </div>
      <ChatWindow
        messages={messages}
        streaming={streaming}
        onConfirmPreview={handleConfirmPreview}
        onCancelPreview={handleCancelPreview}
      />
      <ChatInput onSend={handleSend} disabled={streaming} />
    </div>
  );
}
