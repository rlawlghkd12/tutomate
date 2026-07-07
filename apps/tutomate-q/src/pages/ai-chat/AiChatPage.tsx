import { useEffect, useMemo } from 'react';
import { useAuthStore, useAiNotifyStore } from '@tutomate/core';
import type { SmartCard } from '@tutomate/core';
import { ChatWindow } from './components/ChatWindow';
import { ChatInput } from './components/ChatInput';
import { ModelDownloadModal } from './components/ModelDownloadModal';
import { AiCloudConsentModal } from './components/AiCloudConsentModal';
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
  const cloudBackend = useAiChatStore((s) => s.cloudBackend);
  const cloudConsent = useAiChatStore((s) => s.cloudConsent);
  const acceptCloudConsent = useAiChatStore((s) => s.acceptCloudConsent);
  const usage = useAiChatStore((s) => s.usage);
  const refreshUsage = useAiChatStore((s) => s.refreshUsage);
  const messages = useAiChatStore((s) => s.messages);
  const streaming = useAiChatStore((s) => s.streaming);
  const summarizing = useAiChatStore((s) => s.summarizing);
  const contextPercent = useAiChatStore((s) => s.contextPercent);
  const init = useAiChatStore((s) => s.init);
  const loadForOrg = useAiChatStore((s) => s.loadForOrg);
  const setStatus = useAiChatStore((s) => s.setStatus);
  const refreshStatus = useAiChatStore((s) => s.refreshStatus);
  const send = useAiChatStore((s) => s.send);
  const retry = useAiChatStore((s) => s.retry);
  const confirmPreview = useAiChatStore((s) => s.confirmPreview);
  const confirmBankDeposits = useAiChatStore((s) => s.confirmBankDeposits);
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

  // 클라우드: 동의 완료 후 이번 달 사용량을 미리 조회해 한도 임박/초과 배너를 띄운다(첫 채팅 전에도).
  useEffect(() => {
    if (cloudBackend && cloudConsent && accessToken) void refreshUsage(accessToken);
  }, [cloudBackend, cloudConsent, accessToken, refreshUsage]);

  const handleResetChat = () => {
    if (streaming) return;
    if (messages.length > 0 && !confirm('새 대화를 시작할까요? 지금까지의 대화 내용이 모두 사라집니다.')) return;
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
  if (status === 'not_installed' || status === 'engine_missing') {
    return (
      <ModelDownloadModal
        onInstalled={() => refreshStatus()}
        onSkip={() => setStatus('disabled')}
      />
    );
  }
  if (status === 'disabled') {
    return <DirectImportFallback />;
  }
  // 클라우드 백엔드는 개인정보가 기기를 벗어나므로, 첫 사용 전 동의를 받는다.
  if (cloudBackend && !cloudConsent) {
    return (
      <AiCloudConsentModal
        onAccept={acceptCloudConsent}
        onDecline={() => setStatus('disabled')}
      />
    );
  }

  return (
    <div className="relative flex flex-col h-full min-h-0">
      {usage && usage.level !== 'none' && (
        <div
          className={`px-4 py-2 text-sm text-center ${
            usage.level === 'exceeded'
              ? 'bg-red-50 text-red-700 border-b border-red-200'
              : 'bg-amber-50 text-amber-700 border-b border-amber-200'
          }`}
        >
          {usage.level === 'exceeded'
            ? '이번 달 AI 사용 한도를 모두 사용했어요. 다음 달에 다시 이용하실 수 있어요.'
            : `이번 달 AI 사용량이 ${usage.percent}%에 도달했어요. 한도에 가까워지고 있어요.`}
        </div>
      )}
      {messages.length > 0 && (
        <div className="absolute top-2 right-3 z-10 flex items-center gap-3">
          {contextPercent > 0 && (
            <div
              className="flex items-center gap-2 rounded-full border border-border bg-background/90 px-3 py-1.5 text-sm text-muted-foreground shadow-sm backdrop-blur"
              title="현재 대화가 AI의 기억 공간을 차지한 정도예요. 꽉 차면 오래된 대화를 자동으로 요약해 정리합니다."
            >
              <span>기억</span>
              <div className="h-2.5 w-24 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full transition-all ${
                    contextPercent >= 90
                      ? 'bg-red-500'
                      : contextPercent >= 75
                        ? 'bg-amber-500'
                        : 'bg-emerald-500'
                  }`}
                  style={{ width: `${contextPercent}%` }}
                />
              </div>
            </div>
          )}
          <button
            onClick={handleResetChat}
            disabled={streaming}
            className="rounded-full border border-border bg-background/90 px-3 py-1.5 text-sm shadow-sm backdrop-blur hover:bg-accent disabled:opacity-50"
          >
            새 대화 시작
          </button>
        </div>
      )}
      <ChatWindow
        messages={messages}
        streaming={streaming}
        summarizing={summarizing}
        onConfirmPreview={(card: Extract<SmartCard, { type: 'importPreview' }>) => confirmPreview(card, ctx)}
        onConfirmBankDeposits={(card, selections) => confirmBankDeposits(card, selections, ctx)}
        onCancelPreview={cancelPreview}
        onRetry={() => retry(ctx)}
      />
      <ChatInput
        onSend={(text, attachment) => send(text, attachment, ctx)}
        onCancel={cancelStreaming}
        streaming={streaming}
      />
    </div>
  );
}
