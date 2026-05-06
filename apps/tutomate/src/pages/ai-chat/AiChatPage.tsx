import { useEffect, useState, useCallback } from 'react';
import { useAuthStore } from '@tutomate/core';
import type { ChatMessage, SmartCard } from '@tutomate/core';
import { ChatWindow } from './components/ChatWindow';
import { ChatInput } from './components/ChatInput';
import { ModelDownloadModal } from './components/ModelDownloadModal';
import { DirectImportFallback } from './components/DirectImportFallback';
import type { DisplayMessage } from './components/MessageBubble';

type AiState = 'not_installed' | 'loading_pending' | 'ready' | 'disabled';

export default function AiChatPage() {
  const orgId = useAuthStore((s) => s.currentOrgId ?? '');
  const userId = useAuthStore((s) => s.user?.id ?? '');

  const [state, setState] = useState<AiState>('loading_pending');
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [streaming, setStreaming] = useState(false);

  // 진단·상태 결정
  useEffect(() => {
    (async () => {
      const status = (await window.electronAPI.aiStatus()) as AiState;
      if (status === 'not_installed') {
        const d = await window.electronAPI.aiDiagnose();
        if (d.recommendation === 'block') {
          setState('disabled');
          return;
        }
        setState('not_installed');
        return;
      }
      setState(status);
    })();
  }, []);

  // chat 스트림 이벤트 수신 → messages 갱신
  useEffect(() => {
    if (state !== 'ready') return;
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
      } else if (e.type === 'done' || e.type === 'error') {
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

  if (state === 'loading_pending') {
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

  return (
    <div className="flex flex-col h-full">
      <ChatWindow
        messages={messages}
        onConfirmPreview={handleConfirmPreview}
        onCancelPreview={handleCancelPreview}
      />
      <ChatInput onSend={handleSend} disabled={streaming} />
    </div>
  );
}
