import { create } from 'zustand';
import { useAiNotifyStore, reportError } from '@tutomate/core';
import type { ChatMessage, SmartCard } from '@tutomate/core';
import type { DisplayMessage } from './components/MessageBubble';

export type AiState =
  | 'unknown'
  | 'not_installed'
  | 'engine_missing'
  | 'loading_pending'
  | 'ready'
  | 'disabled';

const HISTORY_LIMIT = 400; // 표시용 메시지 최대 보존 수 (컨텍스트 압축은 별도)
const COMPRESS_TRIGGER = 3200; // 요약 안 된 활성 대화가 이 추정 토큰을 넘으면 압축
const TAIL_TOKEN_BUDGET = 2400; // 최근 메시지를 원문으로 유지할 예산
// 토큰 추정 — 과소평가 시 프롬프트가 n_ctx를 넘겨 답변이 잘리므로 보수적으로(많게) 잡는다.
// 한글은 글자당 1토큰 이상인 경우가 많아 1.3배, ASCII는 3글자/토큰으로 가정.
const estTokens = (s?: string) => {
  if (!s) return 0;
  let cjk = 0;
  let other = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    if ((c >= 0x3000 && c <= 0x9fff) || (c >= 0xac00 && c <= 0xd7af)) cjk++;
    else other++;
  }
  return Math.ceil(cjk * 1.3 + other / 3);
};

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
    const dropped = Math.max(0, h.messages.length - HISTORY_LIMIT);
    const messages = dropped > 0 ? h.messages.slice(dropped) : h.messages;
    const summarizedCount = Math.max(0, h.summarizedCount - dropped);
    localStorage.setItem(
      historyKey(orgId),
      JSON.stringify({ messages, summary: h.summary, summarizedCount }),
    );
  } catch (e) {
    console.warn('[aiChatStore] history save failed:', e);
  }
}

/** 메시지/요약을 보낼 조직·사용자 컨텍스트 */
export interface SendContext {
  orgId: string;
  userId: string;
  accessToken: string;
  refreshToken: string;
  orgName: string;
  orgPlan: string;
  userEmail: string;
}

interface AiChatStore {
  status: AiState;
  statusError: string | null;
  messages: DisplayMessage[];
  streaming: boolean;
  summarizing: boolean;
  contextPercent: number;
  summary: string;
  summarizedCount: number;
  loadedOrgId: string | null;
  _inited: boolean;

  init: () => void;
  loadForOrg: (orgId: string) => void;
  setStatus: (s: AiState) => void;
  refreshStatus: () => Promise<void>;
  send: (text: string, attachment: { fileId: string; name: string } | undefined, ctx: SendContext) => Promise<void>;
  confirmPreview: (card: Extract<SmartCard, { type: 'importPreview' }>, ctx: SendContext) => Promise<void>;
  cancelPreview: () => void;
  cancelStreaming: () => void;
  reset: (orgId: string) => void;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const s = useAiChatStore.getState();
    if (s.loadedOrgId == null) return;
    saveHistory(s.loadedOrgId, {
      messages: s.messages,
      summary: s.summary,
      summarizedCount: s.summarizedCount,
    });
  }, 300);
}

export const useAiChatStore = create<AiChatStore>((set, get) => ({
  status: 'unknown',
  statusError: null,
  messages: [],
  streaming: false,
  summarizing: false,
  contextPercent: 0,
  summary: '',
  summarizedCount: 0,
  loadedOrgId: null,
  _inited: false,

  // 앱 생애주기 동안 1회만: 상태 점검 + chat 이벤트 구독(페이지 이동해도 유지 → 대화 안 끊김)
  init: () => {
    if (get()._inited) return;
    set({ _inited: true });

    // chat 스트림 구독 — AiChatPage 언마운트와 무관하게 계속 수신
    window.electronAPI.onAiChatEvent((e: any) => {
      if (e.type === 'token') {
        set((state) => {
          const m = state.messages;
          const last = m[m.length - 1];
          const incoming = e.token as string;
          if (last?.role === 'assistant') {
            const prevContent = last.content ?? '';
            const next = prevContent === '' ? incoming.replace(/^\s+/, '') : prevContent + incoming;
            if (next === '') return {};
            return { messages: [...m.slice(0, -1), { ...last, content: next }] };
          }
          const trimmed = incoming.replace(/^\s+/, '');
          if (trimmed === '') return {};
          return { messages: [...m, { role: 'assistant', content: trimmed }] };
        });
        scheduleSave();
      } else if (e.type === 'tool_call') {
        const name = (e.toolCall?.name as string) ?? '';
        if (!name) return;
        set((state) => {
          const m = state.messages;
          const last = m[m.length - 1];
          if (last?.role === 'assistant') {
            const tools = [...(last.tools ?? []), { name, status: 'running' as const }];
            return { messages: [...m.slice(0, -1), { ...last, tools }] };
          }
          return { messages: [...m, { role: 'assistant', content: '', tools: [{ name, status: 'running' as const }] }] };
        });
      } else if (e.type === 'tool_result') {
        set((state) => {
          const m = state.messages;
          const last = m[m.length - 1];
          if (last?.role !== 'assistant' || !last.tools?.length) return {};
          const tools = [...last.tools];
          for (let i = tools.length - 1; i >= 0; i--) {
            if (tools[i].status === 'running') {
              tools[i] = { ...tools[i], status: 'done' };
              break;
            }
          }
          return { messages: [...m.slice(0, -1), { ...last, tools }] };
        });
      } else if (e.type === 'card') {
        set((state) => {
          const m = state.messages;
          const last = m[m.length - 1];
          if (last?.role === 'assistant') {
            const cards = [...(last.cards ?? []), e.card as SmartCard];
            return { messages: [...m.slice(0, -1), { ...last, cards }] };
          }
          return { messages: [...m, { role: 'assistant', content: '', cards: [e.card] }] };
        });
        scheduleSave();
      } else if (e.type === 'usage') {
        const u = e.usage as { promptTokens: number; ctxSize: number } | undefined;
        if (u?.ctxSize) {
          set({ contextPercent: Math.min(100, Math.round((u.promptTokens / u.ctxSize) * 100)) });
        }
      } else if (e.type === 'error') {
        const msg: string = e.message ?? '알 수 없는 오류가 생겼어요.';
        set((state) => ({
          messages: [...state.messages, { role: 'assistant', content: msg }],
          streaming: false,
        }));
        scheduleSave();
        // 사용자 취소(abort)는 정상 흐름이라 로그 제외 — 그 외엔 error_logs에 자동 캡처.
        if (!/취소|멈췄/i.test(msg)) {
          void reportError(new Error(msg), 'ai-chat');
        }
      } else if (e.type === 'done') {
        set({ streaming: false });
        scheduleSave();
        // AI 페이지를 안 보고 있으면 사이드바에 완료 알림 표시
        useAiNotifyStore.getState().notifyAnswerDone();
      }
    });

    // 상태 점검
    (async () => {
      try {
        if (!window.electronAPI?.aiStatus) {
          throw new Error('electronAPI.aiStatus 미정의 — preload 갱신 필요');
        }
        const status = (await window.electronAPI.aiStatus()) as AiState;
        // 엔진·모델 중 무엇이든 없으면 설치 온보딩 필요 — 사양 미달이면 차단
        if (status === 'not_installed' || status === 'engine_missing') {
          const d = await window.electronAPI.aiDiagnose();
          set({ status: d.recommendation === 'block' ? 'disabled' : status });
          return;
        }
        set({ status });
      } catch (e: any) {
        set({ statusError: e?.message ?? String(e) });
      }
    })();
  },

  // 조직이 바뀔 때만 localStorage에서 히스토리 로드 (같은 조직이면 메모리 상태 유지)
  loadForOrg: (orgId: string) => {
    if (get().loadedOrgId === orgId) return;
    const h = loadHistory(orgId);
    set({
      loadedOrgId: orgId,
      messages: h.messages,
      summary: h.summary,
      summarizedCount: h.summarizedCount,
    });
  },

  setStatus: (s) => set({ status: s }),

  // 설치 완료 후 실제 상태 재조회 (엔진·모델 모두 갖춰졌는지 메인에 다시 물음)
  refreshStatus: async () => {
    try {
      const status = (await window.electronAPI.aiStatus()) as AiState;
      set({ status });
    } catch (e: any) {
      set({ statusError: e?.message ?? String(e) });
    }
  },

  send: async (text, attachment, ctx) => {
    const userMsg: ChatMessage = {
      role: 'user',
      content: text,
      attachments: attachment ? [{ fileId: attachment.fileId, name: attachment.name }] : undefined,
    };
    const messages = get().messages;
    set({ messages: [...messages, userMsg], streaming: true });
    scheduleSave();

    if (!ctx.orgId) {
      set((state) => ({
        messages: [...state.messages, { role: 'assistant', content: '로그인된 조직 정보를 찾을 수 없어요. 다시 로그인해주세요.' }],
        streaming: false,
      }));
      return;
    }

    // ── 컨텍스트 압축 ──
    let curSummary = get().summary;
    let curCount = Math.min(get().summarizedCount, messages.length);
    const tailTokens =
      messages.slice(curCount).reduce((s, m) => s + estTokens(m.content), 0) + estTokens(text);

    if (tailTokens > COMPRESS_TRIGGER) {
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
        set({ summarizing: true });
        try {
          const res = await window.electronAPI.aiSummarize({
            prevSummary: curSummary,
            messages: toFold.map((m) => ({ role: m.role, content: m.content ?? '' })),
          });
          if (res?.summary && res.summary !== curSummary) {
            curSummary = res.summary;
            curCount = keepStart;
            set({ summary: curSummary, summarizedCount: curCount });
          }
        } catch (e) {
          console.warn('[aiChatStore] 컨텍스트 압축 실패, 원문으로 진행:', e);
        } finally {
          set({ summarizing: false });
        }
      }
    }

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

    await window.electronAPI.aiChat({
      messages: messagesForLlm,
      orgId: ctx.orgId,
      userId: ctx.userId,
      hasAttachment: !!attachment,
      accessToken: ctx.accessToken,
      refreshToken: ctx.refreshToken,
      orgName: ctx.orgName,
      orgPlan: ctx.orgPlan,
      userEmail: ctx.userEmail,
      summary: curSummary || undefined,
    });
  },

  confirmPreview: async (card, ctx) => {
    set({ streaming: true });
    try {
      const r = await window.electronAPI.aiDispatch({
        toolName: 'confirmImport',
        args: { fileId: card.fileId, mapping: card.mapping, kind: card.kind },
        orgId: ctx.orgId,
        userId: ctx.userId,
        accessToken: ctx.accessToken,
        refreshToken: ctx.refreshToken,
      });
      if (r.error) {
        set((state) => ({
          messages: [...state.messages, { role: 'assistant', content: `확정 실패: ${r.error?.message}` }],
        }));
      }
    } finally {
      set({ streaming: false });
      scheduleSave();
    }
  },

  cancelPreview: () => {
    set((state) => ({ messages: [...state.messages, { role: 'assistant', content: '취소했습니다.' }] }));
    scheduleSave();
  },

  cancelStreaming: () => {
    window.electronAPI.aiCancel?.().catch(() => undefined);
    set({ streaming: false });
  },

  reset: (orgId) => {
    set({ messages: [], summary: '', summarizedCount: 0, contextPercent: 0 });
    saveHistory(orgId, { messages: [], summary: '', summarizedCount: 0 });
    window.electronAPI.aiResetSession?.().catch(() => undefined);
  },
}));
