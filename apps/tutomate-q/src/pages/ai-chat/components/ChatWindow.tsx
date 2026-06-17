import { useEffect, useRef } from 'react';
import type { SmartCard } from '@tutomate/core';
import { MessageBubble, type DisplayMessage } from './MessageBubble';

interface Props {
  messages: DisplayMessage[];
  streaming?: boolean;
  onConfirmPreview: (card: Extract<SmartCard, { type: 'importPreview' }>) => void;
  onCancelPreview: () => void;
}

/** 스트림 시작 후 첫 토큰까지 보여줄 타이핑 인디케이터 */
function TypingIndicator() {
  return (
    <div className="max-w-2xl">
      <div className="rounded-2xl px-5 py-3 bg-muted text-foreground inline-flex items-center gap-2">
        <span className="text-base text-muted-foreground">답변 중</span>
        <span className="inline-flex gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground typing-dot" />
          <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground typing-dot" style={{ animationDelay: '0.15s' }} />
          <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground typing-dot" style={{ animationDelay: '0.3s' }} />
        </span>
      </div>
      <style>{`
        @keyframes typing-bounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-3px); opacity: 1; }
        }
        .typing-dot { animation: typing-bounce 1s infinite; display: inline-block; }
      `}</style>
    </div>
  );
}

export function ChatWindow({ messages, streaming, onConfirmPreview, onCancelPreview }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: 'smooth' });
  }, [messages, streaming]);

  // 마지막 메시지가 user면 아직 assistant 응답 시작 전 → 타이핑 표시
  // 마지막이 assistant라도 빈 콘텐츠 + cards 없음이면 도구 호출 중일 수 있음 → 표시
  const last = messages[messages.length - 1];
  const showTyping = streaming && (
    !last ||
    last.role === 'user' ||
    (last.role === 'assistant' && !last.content && !(last.cards && last.cards.length))
  );

  return (
    <div ref={ref} className="flex-1 overflow-y-auto p-4 space-y-3">
      {messages.length === 0 && !streaming && (
        <div className="text-center text-muted-foreground mt-12 text-lg">
          안녕하세요. 수강생 정보를 묻거나 엑셀을 첨부해 추가해주세요.
        </div>
      )}
      {messages.map((m, i) => (
        <MessageBubble
          key={i}
          message={m}
          onConfirmPreview={onConfirmPreview}
          onCancelPreview={onCancelPreview}
        />
      ))}
      {showTyping && <TypingIndicator />}
    </div>
  );
}
