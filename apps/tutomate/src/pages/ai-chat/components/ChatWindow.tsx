import { useEffect, useRef } from 'react';
import type { SmartCard } from '@tutomate/core';
import { MessageBubble, type DisplayMessage } from './MessageBubble';

interface Props {
  messages: DisplayMessage[];
  onConfirmPreview: (card: Extract<SmartCard, { type: 'importPreview' }>) => void;
  onCancelPreview: () => void;
}

export function ChatWindow({ messages, onConfirmPreview, onCancelPreview }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  return (
    <div ref={ref} className="flex-1 overflow-y-auto p-4 space-y-3">
      {messages.length === 0 && (
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
    </div>
  );
}
