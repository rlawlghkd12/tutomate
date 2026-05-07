import { useState, useRef } from 'react';

interface Props {
  onSend: (
    text: string,
    attachment?: { fileId: string; name: string },
  ) => void;
  disabled?: boolean;
}

export function ChatInput({ onSend, disabled }: Props) {
  const [text, setText] = useState('');
  const [attachment, setAttachment] = useState<{ fileId: string; name: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function pickFile(file: File) {
    const buf = await file.arrayBuffer();
    const r = await window.electronAPI.fileStashSave(file.name, buf);
    setAttachment(r);
  }

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
          📎 {attachment.name}
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
      <div className="flex gap-2">
        <button
          onClick={() => fileRef.current?.click()}
          disabled={disabled}
          className="px-4 py-3 bg-secondary text-secondary-foreground rounded-xl text-lg disabled:opacity-50 hover:bg-accent"
          aria-label="파일 첨부"
        >
          📎
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
          disabled={disabled}
          className="flex-1 border border-border rounded-xl px-4 py-3 text-lg bg-background text-foreground placeholder:text-muted-foreground disabled:opacity-50"
        />
        <button
          onClick={handleSend}
          disabled={disabled}
          className="bg-primary text-primary-foreground px-6 py-3 rounded-xl text-lg disabled:opacity-50"
        >
          보내기
        </button>
      </div>
    </div>
  );
}
