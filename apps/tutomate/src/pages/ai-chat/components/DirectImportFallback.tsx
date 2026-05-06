import { useState } from 'react';
import type { SmartCard } from '@tutomate/core';
import { useAuthStore } from '@tutomate/core';
import { ImportPreviewCard } from './SmartCard/ImportPreviewCard';
import { ImportResultCard } from './SmartCard/ImportResultCard';
import { MappingErrorCard } from './SmartCard/MappingErrorCard';

export function DirectImportFallback() {
  const orgId = useAuthStore((s) => s.currentOrgId ?? '');
  const userId = useAuthStore((s) => s.user?.id ?? '');
  const [card, setCard] = useState<SmartCard | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(file: File) {
    setBusy(true);
    setCard(null);
    try {
      const buf = await file.arrayBuffer();
      const { fileId } = await window.electronAPI.fileStashSave(file.name, buf);
      const result = await window.electronAPI.aiDirectImport(fileId, orgId, userId);
      setCard(result.card ?? null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-3">엑셀 직접 임포트</h1>
      <p className="text-lg mb-4">
        AI 어시스턴트를 사용할 수 없는 사양이라 엑셀을 직접 임포트합니다.
      </p>
      <input
        type="file"
        accept=".xlsx,.xls"
        disabled={busy}
        onChange={(e) =>
          e.target.files?.[0] && handleFile(e.target.files[0])
        }
        className="block w-full text-base mb-4"
      />
      {busy && <div>처리 중…</div>}
      {card?.type === 'mappingError' && <MappingErrorCard {...card} />}
      {card?.type === 'importPreview' && (
        <ImportPreviewCard
          {...card}
          onConfirm={() => {
            // 직접 임포트는 confirmImport를 LLM 우회로 호출 — 별도 IPC 추가 필요시 확장
            // v1: 사용자가 챗봇 활성화 후 처리하도록 안내
            alert('확정은 챗봇이 활성화된 PC에서 처리해주세요.');
          }}
          onCancel={() => setCard(null)}
        />
      )}
      {card?.type === 'importResult' && <ImportResultCard {...card} />}
    </div>
  );
}
