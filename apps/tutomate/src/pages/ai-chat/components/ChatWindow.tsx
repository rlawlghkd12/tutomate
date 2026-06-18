import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowDown } from 'lucide-react';
import type { SmartCard } from '@tutomate/core';
import { MessageBubble, type DisplayMessage } from './MessageBubble';

interface Props {
  messages: DisplayMessage[];
  streaming?: boolean;
  summarizing?: boolean;
  onConfirmPreview: (card: Extract<SmartCard, { type: 'importPreview' }>) => void;
  onCancelPreview: () => void;
}

/** 대화가 길어져 이전 내용을 요약(압축)하는 동안 보여줄 인디케이터 */
function SummarizingIndicator() {
  return (
    <div className="max-w-2xl">
      <div className="rounded-2xl px-5 py-3 bg-muted text-foreground inline-flex items-center gap-2">
        <span className="text-base text-muted-foreground">이전 대화 요약 중</span>
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

export function ChatWindow({ messages, streaming, summarizing, onConfirmPreview, onCancelPreview }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    const el = ref.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  };

  // 페이지 진입 시 즉시 맨 아래로
  useLayoutEffect(() => {
    scrollToBottom('auto');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 새 메시지/스트리밍: 사용자가 맨 아래를 보고 있을 때만 따라 내려감
  useEffect(() => {
    if (atBottom) scrollToBottom('smooth');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, streaming, summarizing]);

  const handleScroll = () => {
    const el = ref.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    setAtBottom(dist < 80);
  };

  return (
    <div className="relative flex-1 min-h-0">
      <div ref={ref} onScroll={handleScroll} className="h-full overflow-y-auto p-4 space-y-3">
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
        {summarizing && <SummarizingIndicator />}
        {streaming &&
          !summarizing &&
          (() => {
            const last = messages[messages.length - 1];
            const showTyping =
              !last ||
              last.role === 'user' ||
              (last.role === 'assistant' &&
                !last.content &&
                !(last.cards && last.cards.length) &&
                !(last.tools && last.tools.length));
            return showTyping ? <TypingIndicator /> : null;
          })()}
      </div>

      {!atBottom && (
        <button
          onClick={() => scrollToBottom('smooth')}
          aria-label="맨 아래로 이동"
          className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 rounded-full border border-border bg-background px-4 py-2 text-sm font-medium shadow-lg hover:bg-accent"
        >
          <ArrowDown className="h-4 w-4" />
          맨 아래로
        </button>
      )}
    </div>
  );
}
