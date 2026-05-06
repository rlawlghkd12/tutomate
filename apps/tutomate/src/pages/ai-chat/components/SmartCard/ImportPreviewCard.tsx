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
    <div className="border-2 border-blue-300 bg-blue-50 rounded-2xl p-4">
      <div className="font-bold text-lg mb-2">
        미리보기 (총 {total}행 중 5행 표시)
      </div>
      {errorRows > 0 && (
        <div className="text-red-700 mb-2">
          ⚠ {errorRows}개 행에 오류가 있어 제외됩니다
        </div>
      )}
      <div className="bg-white rounded-xl p-2 mb-3 max-h-60 overflow-y-auto">
        {rows.slice(0, 5).map((r, i) => (
          <div
            key={i}
            className={`text-sm p-2 border-b last:border-0 ${
              r.errors?.length ? 'bg-red-50' : ''
            }`}
          >
            {Object.entries(r.data).map(([k, v]) => (
              <span key={k} className="mr-3">
                <strong>{k}</strong>: {String(v)}
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
          className="bg-blue-600 text-white px-6 py-3 rounded-xl text-lg disabled:opacity-50"
        >
          {busy ? '처리 중…' : '확정'}
        </button>
        <button
          disabled={busy}
          onClick={onCancel}
          className="bg-gray-200 px-6 py-3 rounded-xl text-lg disabled:opacity-50"
        >
          취소
        </button>
      </div>
    </div>
  );
}
