import { useState, useRef, useEffect } from 'react';
import { Paperclip } from 'lucide-react';

interface Props {
  onSend: (
    text: string,
    attachment?: { fileId: string; name: string },
  ) => void;
  onCancel?: () => void;
  /** 스트리밍 중 (응답 받는 중) */
  streaming?: boolean;
  /** 채팅 영역에 드래그앤드롭된 파일 (AiChatPage에서 전달). 소비 후 onDroppedFileHandled 호출 */
  droppedFile?: File | null;
  onDroppedFileHandled?: () => void;
}

export function ChatInput({ onSend, onCancel, streaming, droppedFile, onDroppedFileHandled }: Props) {
  const [text, setText] = useState('');
  const [attachment, setAttachment] = useState<{ fileId: string; name: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function pickFile(file: File) {
    if (!/\.(xlsx|xls)$/i.test(file.name)) return; // 엑셀 파일만 첨부
    try {
      const buf = await file.arrayBuffer();
      const r = await window.electronAPI.fileStashSave(file.name, buf);
      setAttachment(r);
    } catch (e) {
      console.error('파일 첨부 실패:', e);
    }
  }

  // 드래그앤드롭으로 들어온 파일 첨부 (AiChatPage가 droppedFile로 전달)
  useEffect(() => {
    if (!droppedFile) return;
    pickFile(droppedFile);
    onDroppedFileHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [droppedFile]);

  function handleSend() {
    if (!text.trim() && !attachment) return;
    onSend(text, attachment ?? undefined);
    setText('');
    setAttachment(null);
  }

  return (
    <div className="border-t border-border p-3 flex flex-col gap-2 bg-background">
      {attachment && (
        <div className="text-sm flex items-center gap-2 bg-muted text-foreground px-3 py-2 rounded-lg">
          <Paperclip className="h-4 w-4 shrink-0" />
          {attachment.name}
          <button
            onClick={() => {
              window.electronAPI.fileStashDelete(attachment.fileId);
              setAttachment(null);
            }}
            className="text-destructive ml-auto"
            aria-label="첨부 제거"
          >
            ×
          </button>
        </div>
      )}
      <div className="flex items-center gap-2">
        <button
          onClick={() => fileRef.current?.click()}
          disabled={streaming}
          className="h-12 w-12 shrink-0 flex items-center justify-center rounded-xl border border-border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
          aria-label="파일 첨부"
        >
          <Paperclip className="h-5 w-5" />
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls"
          hidden
          onChange={(e) => e.target.files?.[0] && pickFile(e.target.files[0])}
        />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
          placeholder="질문하거나 엑셀을 첨부하세요"
          disabled={streaming}
          className="h-12 flex-1 min-w-0 rounded-xl border border-border bg-background px-4 text-lg text-foreground placeholder:text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        />
        {streaming ? (
          <button
            onClick={onCancel}
            className="h-12 shrink-0 rounded-xl bg-destructive px-6 text-lg font-medium text-destructive-foreground transition-opacity hover:opacity-90"
            aria-label="응답 중지"
          >
            ■ 중지
          </button>
        ) : (
          <button
            onClick={handleSend}
            className="h-12 shrink-0 rounded-xl bg-primary px-6 text-lg font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            보내기
          </button>
        )}
      </div>
    </div>
  );
}
