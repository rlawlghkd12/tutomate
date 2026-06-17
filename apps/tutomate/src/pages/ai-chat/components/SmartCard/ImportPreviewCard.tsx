import { useState } from 'react';
import type { SmartCard } from '@tutomate/core';

type Props = Extract<SmartCard, { type: 'importPreview' }> & {
  onConfirm: () => void;
  onCancel: () => void;
};

export function ImportPreviewCard({
  rows,
  total,
  errorRows,
  onConfirm,
  onCancel,
}: Props) {
  const [busy, setBusy] = useState(false);

  return (
    <div className="border-2 border-primary/40 bg-primary/5 rounded-2xl p-4 text-foreground">
      <div className="font-bold text-lg mb-2">
        미리보기 (총 {total}행 중 5행 표시)
      </div>
      {errorRows > 0 && (
        <div className="text-destructive mb-2">
          ⚠ {errorRows}개 행에 오류가 있어 제외됩니다
        </div>
      )}
      <div className="bg-background border border-border rounded-xl p-2 mb-3 max-h-60 overflow-y-auto">
        {rows.slice(0, 5).map((r, i) => (
          <div
            key={i}
            className={`text-sm p-2 border-b border-border last:border-0 text-foreground ${
              r.errors?.length ? 'bg-destructive/10' : ''
            }`}
          >
            {Object.entries(r.data).map(([k, v]) => (
              <span key={k} className="mr-3">
                <strong>{k}</strong>: <span className="text-muted-foreground">{String(v)}</span>
              </span>
            ))}
          </div>
        ))}
      </div>
      <div className="flex gap-3">
        <button
          disabled={busy}
          onClick={() => {
            setBusy(true);
            onConfirm();
          }}
          className="bg-primary text-primary-foreground px-6 py-3 rounded-xl text-lg disabled:opacity-50"
        >
          {busy ? '처리 중…' : '확정'}
        </button>
        <button
          disabled={busy}
          onClick={onCancel}
          className="bg-secondary text-secondary-foreground border border-border px-6 py-3 rounded-xl text-lg disabled:opacity-50 hover:bg-accent"
        >
          취소
        </button>
      </div>
    </div>
  );
}
