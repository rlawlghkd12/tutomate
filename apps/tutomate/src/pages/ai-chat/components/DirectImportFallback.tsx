import { useState } from 'react';
import type { SmartCard } from '@tutomate/core';
import { useAuthStore, reloadAllStores, dispatchErrorMessage } from '@tutomate/core';
import { ImportPreviewCard, type PaymentSelection } from './SmartCard/ImportPreviewCard';
import { ImportResultCard } from './SmartCard/ImportResultCard';
import { MappingErrorCard } from './SmartCard/MappingErrorCard';

export function DirectImportFallback() {
  const orgId = useAuthStore((s) => s.organizationId ?? '');
  const userId = useAuthStore((s) => s.session?.user?.id ?? '');
  const accessToken = useAuthStore((s) => s.session?.access_token ?? '');
  const refreshToken = useAuthStore((s) => s.session?.refresh_token ?? '');
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

  // 미리보기 확정 저장 — confirmImport를 LLM 우회(ai:dispatch)로 직접 호출.
  // 이 경로는 클라우드 LLM을 쓰지 않으며(confirmImport는 순수 Supabase 저장), 선택 행만 저장한다.
  async function handleConfirm(
    preview: Extract<SmartCard, { type: 'importPreview' }>,
    selections?: PaymentSelection[],
  ) {
    setBusy(true);
    try {
      const r = (await window.electronAPI.aiDispatch({
        toolName: 'confirmImport',
        args: {
          fileId: preview.fileId,
          mapping: preview.mapping,
          kind: preview.kind,
          ...(selections && selections.length > 0 ? { selections } : {}),
        },
        orgId,
        userId,
        accessToken,
        refreshToken,
      })) as { result?: any };
      const errMsg = dispatchErrorMessage(r);
      if (errMsg) {
        alert(`저장 실패: ${errMsg}`);
        return;
      }
      const res = r?.result;
      setCard({
        type: 'importResult',
        added: res?.added ?? 0,
        duplicated: res?.duplicated ?? 0,
        errors: res?.errors ?? 0,
        ...(res?.unmatched ? { unmatched: res.unmatched } : {}),
      });
      // 저장 데이터가 다른 화면(수강생·수익 등)에 즉시 반영되도록 스토어 갱신
      if ((res?.added ?? 0) > 0) await reloadAllStores();
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
        accept=".xlsx,.xls,.csv"
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
          onConfirm={(selections) =>
            handleConfirm(card as Extract<SmartCard, { type: 'importPreview' }>, selections)
          }
          onCancel={() => setCard(null)}
        />
      )}
      {card?.type === 'importResult' && <ImportResultCard {...card} />}
    </div>
  );
}
