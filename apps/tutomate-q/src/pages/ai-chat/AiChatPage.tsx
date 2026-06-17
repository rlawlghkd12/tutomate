import { useEffect, useState, useCallback } from 'react';
import { useAuthStore } from '@tutomate/core';
import type { ChatMessage, SmartCard } from '@tutomate/core';
import { ChatWindow } from './components/ChatWindow';
import { ChatInput } from './components/ChatInput';
import { ModelDownloadModal } from './components/ModelDownloadModal';
import { DirectImportFallback } from './components/DirectImportFallback';
import type { DisplayMessage } from './components/MessageBubble';

type AiState = 'unknown' | 'not_installed' | 'loading_pending' | 'ready' | 'disabled';

const HISTORY_LIMIT = 400; // 표시용 메시지 최대 보존 수 (컨텍스트 압축은 별도)

// 컨텍스트 압축 임계값 (토큰 추정 — 한국어 안전하게 과대추정: 글자수/2)
const COMPRESS_TRIGGER = 3200; // 요약 안 된 활성 대화가 이 추정 토큰을 넘으면 압축
const TAIL_TOKEN_BUDGET = 2400; // 최근 메시지를 원문으로 유지할 예산
const estTokens = (s?: string) => Math.ceil((s?.length ?? 0) / 2);

const historyKey = (orgId: string) => `ai-chat-history:${orgId || 'default'}`;

interface PersistedHistory {
  messages: DisplayMessage[];
  summary: string;
  summarizedCount: number;
}

function loadHistory(orgId: string): PersistedHistory {
  try {
    const raw = localStorage.getItem(historyKey(orgId));
    if (!raw) return { messages: [], summary: '', summarizedCount: 0 };
    const parsed = JSON.parse(raw);
    // 구버전 호환: 배열만 저장돼 있던 경우
    if (Array.isArray(parsed)) return { messages: parsed, summary: '', summarizedCount: 0 };
    const messages: DisplayMessage[] = Array.isArray(parsed.messages) ? parsed.messages : [];
    const summary = typeof parsed.summary === 'string' ? parsed.summary : '';
    const rawCount = typeof parsed.summarizedCount === 'number' ? parsed.summarizedCount : 0;
    return { messages, summary, summarizedCount: Math.max(0, Math.min(rawCount, messages.length)) };
  } catch {
    return { messages: [], summary: '', summarizedCount: 0 };
  }
}

function saveHistory(orgId: string, h: PersistedHistory) {
  try {
    // 표시 한도 초과분은 앞에서 잘라냄. 잘린 만큼 summarizedCount도 보정 (이미 요약에 포함됨)
    const dropped = Math.max(0, h.messages.length - HISTORY_LIMIT);
    const messages = dropped > 0 ? h.messages.slice(dropped) : h.messages;
    const summarizedCount = Math.max(0, h.summarizedCount - dropped);
    localStorage.setItem(
      historyKey(orgId),
      JSON.stringify({ messages, summary: h.summary, summarizedCount }),
    );
  } catch (e) {
    console.warn('[AiChatPage] history save failed:', e);
  }
}

export default function AiChatPage() {
  const orgId = useAuthStore((s) => s.organizationId ?? '');
  const orgName = useAuthStore((s) => s.organizationName ?? '');
  const orgPlan = useAuthStore((s) => (s as any).plan ?? '');
  const userId = useAuthStore((s) => s.session?.user?.id ?? '');
  const userEmail = useAuthStore((s) => s.session?.user?.email ?? '');
  const accessToken = useAuthStore((s) => s.session?.access_token ?? '');
  const refreshToken = useAuthStore((s) => s.session?.refresh_token ?? '');

  const [state, setState] = useState<AiState>('unknown');
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  // 컨텍스트 압축 상태: summary = 접힌 오래된 대화 요약, summarizedCount = 요약에 포함된 선행 메시지 수
  const [summary, setSummary] = useState('');
  const [summarizedCount, setSummarizedCount] = useState(0);

  const [statusError, setStatusError] = useState<string | null>(null);

  // 조직 변경 시 히스토리 로드
  useEffect(() => {
    const h = loadHistory(orgId);
    setMessages(h.messages);
    setSummary(h.summary);
    setSummarizedCount(h.summarizedCount);
  }, [orgId]);

  // 변경 시 자동 저장 (스트리밍 중 토큰마다 저장은 부담 → 한 박자 디바운스)
  useEffect(() => {
    const t = setTimeout(() => saveHistory(orgId, { messages, summary, summarizedCount }), 300);
    return () => clearTimeout(t);
  }, [messages, summary, summarizedCount, orgId]);

  // 진단·상태 결정
  useEffect(() => {
    (async () => {
      try {
        if (!window.electronAPI?.aiStatus) {
          throw new Error('electronAPI.aiStatus 미정의 — preload 갱신 필요');
        }
        console.log('[AiChatPage] aiStatus 호출...');
        const status = (await window.electronAPI.aiStatus()) as AiState;
        console.log('[AiChatPage] aiStatus 응답:', status);
        if (status === 'not_installed') {
          const d = await window.electronAPI.aiDiagnose();
          console.log('[AiChatPage] aiDiagnose:', d);
          if (d.recommendation === 'block') {
            setState('disabled');
            return;
          }
          setState('not_installed');
          return;
        }
        setState(status);
      } catch (e: any) {
        console.error('[AiChatPage] status check failed:', e);
        setStatusError(e?.message ?? String(e));
      }
    })();
  }, []);

  // chat 스트림 이벤트 수신 → messages 갱신
  // loading_pending도 챗 UI 노출 대상 (실 chat 호출 시 lazy load됨)
  useEffect(() => {
    if (state !== 'ready' && state !== 'loading_pending') return;
    return window.electronAPI.onAiChatEvent((e: any) => {
      if (e.type === 'token') {
        setMessages((m) => {
          const last = m[m.length - 1];
          // 답변 앞부분의 빈 공백/줄바꿈은 무시 (Qwen 3.5 thinking 잔여물 차단)
          const incoming = e.token as string;
          if (last?.role === 'assistant') {
            const prevContent = last.content ?? '';
            const next = prevContent === '' ? incoming.replace(/^\s+/, '') : prevContent + incoming;
            if (next === '') return m; // 여전히 공백만이면 추가 무시
            return [...m.slice(0, -1), { ...last, content: next }];
          }
          const trimmed = incoming.replace(/^\s+/, '');
          if (trimmed === '') return m;
          return [...m, { role: 'assistant', content: trimmed }];
        });
      } else if (e.type === 'card') {
        setMessages((m) => {
          const last = m[m.length - 1];
          if (last?.role === 'assistant') {
            const cards = [...(last.cards ?? []), e.card as SmartCard];
            return [...m.slice(0, -1), { ...last, cards }];
          }
          return [...m, { role: 'assistant', content: '', cards: [e.card] }];
        });
      } else if (e.type === 'error') {
        // 에러를 채팅에 시스템 메시지로 표시
        setMessages((m) => [
          ...m,
          { role: 'assistant', content: `⚠️ ${e.message ?? '알 수 없는 오류'}` },
        ]);
        setStreaming(false);
      } else if (e.type === 'done') {
        setStreaming(false);
      }
    });
  }, [state]);

  const handleSend = useCallback(
    async (text: string, attachment?: { fileId: string; name: string }) => {
      // UI에 표시할 user 메시지는 깨끗한 원문 + 첨부 메타
      const userMsg: ChatMessage = {
        role: 'user',
        content: text,
        attachments: attachment
          ? [{ fileId: attachment.fileId, name: attachment.name }]
          : undefined,
      };
      const next = [...messages, userMsg];
      setMessages(next);
      setStreaming(true);

      if (!orgId) {
        setMessages((m) => [
          ...m,
          { role: 'assistant', content: '⚠️ 로그인된 조직 정보를 찾을 수 없어요. 다시 로그인해주세요.' },
        ]);
        setStreaming(false);
        return;
      }

      // ── 컨텍스트 압축 ──
      // 요약 안 된 활성 대화(tail) + 새 메시지의 추정 토큰이 임계를 넘으면,
      // 오래된 앞부분을 요약으로 접어 컨텍스트 윈도우 초과를 방지한다. (davinci식 압축)
      let curSummary = summary;
      let curCount = Math.min(summarizedCount, messages.length);
      const tailTokens =
        messages.slice(curCount).reduce((s, m) => s + estTokens(m.content), 0) + estTokens(text);

      if (tailTokens > COMPRESS_TRIGGER) {
        // 끝에서부터 TAIL_TOKEN_BUDGET 만큼 원문 유지 → 그 앞쪽을 접는다
        let keepStart = messages.length;
        let acc = estTokens(text);
        while (keepStart > curCount) {
          const t = estTokens(messages[keepStart - 1].content);
          if (acc + t > TAIL_TOKEN_BUDGET) break;
          acc += t;
          keepStart--;
        }
        if (keepStart > curCount) {
          const toFold = messages.slice(curCount, keepStart);
          try {
            const res = await window.electronAPI.aiSummarize({
              prevSummary: curSummary,
              messages: toFold.map((m) => ({ role: m.role, content: m.content ?? '' })),
            });
            // 요약이 갱신됐을 때만 진행분 확정 (실패 시 접지 않고 원문 유지 → 다음 턴 재시도)
            if (res?.summary && res.summary !== curSummary) {
              curSummary = res.summary;
              curCount = keepStart;
              setSummary(curSummary);
              setSummarizedCount(curCount);
            }
          } catch (e) {
            console.warn('[AiChatPage] 컨텍스트 압축 실패, 원문으로 진행:', e);
          }
        }
      }

      // LLM이 보는 메시지 = 요약 이후의 tail + (첨부 가이드 임베드한) user 메시지.
      // 첨부 가이드를 별도 system 메시지로 넣으면 런타임이 첫 system만 보고 무시하므로 user에 임베드.
      const tailForLlm = messages.slice(curCount);
      const messagesForLlm: ChatMessage[] = attachment
        ? [
            ...tailForLlm,
            {
              ...userMsg,
              content:
                `${text}\n\n` +
                `[첨부 엑셀: ${attachment.name} (fileId="${attachment.fileId}")]\n` +
                `다음 순서로 처리하세요: parseExcelHeaders → mapColumns → previewImport. ` +
                `매핑 실패 시 표준 양식 안내 후 멈춥니다. ` +
                `previewImport 후 사용자가 "확정"이라고 명시할 때만 confirmImport를 호출하세요.`,
            },
          ]
        : [...tailForLlm, userMsg];

      console.log('[AiChatPage] aiChat 호출 — orgId:', orgId, 'userId:', userId, 'tail:', messagesForLlm.length, 'summary:', curSummary.length);
      await window.electronAPI.aiChat({
        messages: messagesForLlm,
        orgId,
        userId,
        hasAttachment: !!attachment,
        accessToken,
        refreshToken,
        orgName,
        orgPlan,
        userEmail,
        summary: curSummary || undefined,
      });
    },
    [messages, summary, summarizedCount, orgId, userId, accessToken, refreshToken, orgName, orgPlan, userEmail],
  );

  const handleConfirmPreview = useCallback(
    async (card: Extract<SmartCard, { type: 'importPreview' }>) => {
      // 보안: LLM 우회로 confirmImport 직접 dispatch.
      // LLM이 자동 호출 못 하게 차단됨 (시스템 프롬프트 + 화이트리스트).
      setStreaming(true);
      try {
        const r = await window.electronAPI.aiDispatch({
          toolName: 'confirmImport',
          args: { fileId: card.fileId, mapping: card.mapping, kind: card.kind },
          orgId, userId, accessToken, refreshToken,
        });
        if (r.error) {
          setMessages((m) => [
            ...m,
            { role: 'assistant', content: `⚠️ 확정 실패: ${r.error?.message}` },
          ]);
        }
      } finally {
        setStreaming(false);
      }
    },
    [orgId, userId, accessToken, refreshToken],
  );

  const handleCancelPreview = useCallback(() => {
    setMessages((m) => [
      ...m,
      { role: 'assistant', content: '취소했습니다.' },
    ]);
  }, []);

  const handleResetChat = useCallback(() => {
    if (streaming) return;
    if (messages.length > 0 && !confirm('대화를 초기화할까요? 지금까지의 내용이 모두 사라집니다.')) return;
    setMessages([]);
    setSummary('');
    setSummarizedCount(0);
    saveHistory(orgId, { messages: [], summary: '', summarizedCount: 0 });
    window.electronAPI.aiResetSession?.().catch(() => undefined);
  }, [orgId, messages.length, streaming]);

  // 진단 실패 시 에러 표시 (조용히 멈추지 않게)
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

  // unknown: 메인 프로세스 status 응답 대기 중 (initial check)
  if (state === 'unknown') {
    return <div className="p-8 text-center">준비 중…</div>;
  }
  if (state === 'not_installed') {
    return (
      <ModelDownloadModal
        onInstalled={() => setState('ready')}
        onSkip={() => setState('disabled')}
      />
    );
  }
  if (state === 'disabled') {
    return <DirectImportFallback />;
  }
  // 'loading_pending'은 모델 설치 완료 + runtime 미로드 상태.
  // 첫 chat 호출 시 메인이 lazy load 하므로 chat UI 노출.

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-background">
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
        onConfirmPreview={handleConfirmPreview}
        onCancelPreview={handleCancelPreview}
      />
      <ChatInput
        onSend={handleSend}
        onCancel={() => {
          window.electronAPI.aiCancel?.().catch(() => undefined);
          setStreaming(false);
        }}
        streaming={streaming}
      />
    </div>
  );
}
