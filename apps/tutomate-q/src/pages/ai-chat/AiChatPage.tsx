import { useEffect, useMemo } from 'react';
import { useAuthStore, useAiNotifyStore } from '@tutomate/core';
import type { SmartCard } from '@tutomate/core';
import { ChatWindow } from './components/ChatWindow';
import { ChatInput } from './components/ChatInput';
import { ModelDownloadModal } from './components/ModelDownloadModal';
import { DirectImportFallback } from './components/DirectImportFallback';
import { useAiChatStore, type SendContext } from './aiChatStore';

export default function AiChatPage() {
  const orgId = useAuthStore((s) => s.organizationId ?? '');
  const orgName = useAuthStore((s) => s.organizationName ?? '');
  const orgPlan = useAuthStore((s) => (s as any).plan ?? '');
  const userId = useAuthStore((s) => s.session?.user?.id ?? '');
  const userEmail = useAuthStore((s) => s.session?.user?.email ?? '');
  const accessToken = useAuthStore((s) => s.session?.access_token ?? '');
  const refreshToken = useAuthStore((s) => s.session?.refresh_token ?? '');

  const status = useAiChatStore((s) => s.status);
  const statusError = useAiChatStore((s) => s.statusError);
  const messages = useAiChatStore((s) => s.messages);
  const streaming = useAiChatStore((s) => s.streaming);
  const summarizing = useAiChatStore((s) => s.summarizing);
  const summary = useAiChatStore((s) => s.summary);
  const init = useAiChatStore((s) => s.init);
  const loadForOrg = useAiChatStore((s) => s.loadForOrg);
  const setStatus = useAiChatStore((s) => s.setStatus);
  const send = useAiChatStore((s) => s.send);
  const confirmPreview = useAiChatStore((s) => s.confirmPreview);
  const cancelPreview = useAiChatStore((s) => s.cancelPreview);
  const cancelStreaming = useAiChatStore((s) => s.cancelStreaming);
  const reset = useAiChatStore((s) => s.reset);

  const ctx: SendContext = useMemo(
    () => ({ orgId, userId, accessToken, refreshToken, orgName, orgPlan, userEmail }),
    [orgId, userId, accessToken, refreshToken, orgName, orgPlan, userEmail],
  );

  useEffect(() => {
    init();
  }, [init]);

  // AI 페이지를 보는 동안엔 알림 해제, 이탈 시 다시 알림 받을 수 있게
  useEffect(() => {
    const { setViewing } = useAiNotifyStore.getState();
    setViewing(true);
    return () => setViewing(false);
  }, []);

  useEffect(() => {
    loadForOrg(orgId);
  }, [orgId, loadForOrg]);

  const handleResetChat = () => {
    if (streaming) return;
    if (messages.length > 0 && !confirm('대화를 초기화할까요? 지금까지의 내용이 모두 사라집니다.')) return;
    reset(orgId);
  };

  if (statusError) {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <h1 className="text-xl font-bold mb-3">AI 어시스턴트 준비 실패</h1>
        <pre className="bg-red-50 text-red-700 p-3 rounded text-sm whitespace-pre-wrap">{statusError}</pre>
        <p className="mt-4 text-sm text-gray-600">
          앱을 완전히 종료한 후 다시 실행해주세요. (개발 중이라면 electron 재시작 필요 — Vite 새로고침으로는 main 프로세스 변경이 반영되지 않습니다.)
        </p>
      </div>
    );
  }

  if (status === 'unknown') {
    return <div className="p-8 text-center">준비 중…</div>;
  }
  if (status === 'not_installed') {
    return (
      <ModelDownloadModal
        onInstalled={() => setStatus('ready')}
        onSkip={() => setStatus('disabled')}
      />
    );
  }
  if (status === 'disabled') {
    return <DirectImportFallback />;
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-background shrink-0">
        <div className="text-sm text-muted-foreground">
          {messages.length > 0
            ? `대화 ${messages.length}개${summary ? ' · 이전 내용 요약됨' : ''}`
            : '대화 없음'}
        </div>
        <button
          onClick={handleResetChat}
          disabled={streaming || messages.length === 0}
          className="text-sm px-3 py-1 rounded border border-border hover:bg-accent disabled:opacity-50"
        >
          대화 초기화
        </button>
      </div>
      <ChatWindow
        messages={messages}
        streaming={streaming}
        summarizing={summarizing}
        onConfirmPreview={(card: Extract<SmartCard, { type: 'importPreview' }>) => confirmPreview(card, ctx)}
        onCancelPreview={cancelPreview}
      />
      <ChatInput
        onSend={(text, attachment) => send(text, attachment, ctx)}
        onCancel={cancelStreaming}
        streaming={streaming}
      />
    </div>
  );
}
