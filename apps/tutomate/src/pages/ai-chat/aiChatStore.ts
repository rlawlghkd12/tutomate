import { create } from 'zustand';
import { useAiNotifyStore, reportError, reloadAllStores } from '@tutomate/core';
import type { ChatMessage, SmartCard, DepositSelection } from '@tutomate/core';
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

// 클라우드(OpenRouter) 전송 개인정보 처리 동의 여부 — 기기/사용자 단위로 1회 저장.
// 로컬 백엔드는 데이터가 기기를 안 벗어나므로 동의 불필요.
const CLOUD_CONSENT_KEY = 'ai-cloud-consent';
function loadCloudConsent(): boolean {
  try {
    return localStorage.getItem(CLOUD_CONSENT_KEY) === 'accepted';
  } catch {
    return false;
  }
}

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
  /** 클라우드(OpenRouter) 백엔드로 동작 중인지 — 동의 모달 노출 판단용 */
  cloudBackend: boolean;
  /** 클라우드 전송 개인정보 처리 동의 완료 여부 */
  cloudConsent: boolean;
  /** 이번 달 클라우드 AI 사용량 요약 — 클라우드 백엔드에서만 채워짐(로컬은 null). */
  usage: {
    used: number;
    cap: number;
    scope: 'org' | 'user';
    percent: number;
    remaining: number | null;
    level: 'none' | 'warn' | 'exceeded';
  } | null;
  _inited: boolean;

  init: () => void;
  loadForOrg: (orgId: string) => void;
  setStatus: (s: AiState) => void;
  refreshStatus: () => Promise<void>;
  acceptCloudConsent: () => void;
  refreshUsage: (accessToken?: string) => Promise<void>;
  send: (text: string, attachment: { fileId: string; name: string } | undefined, ctx: SendContext) => Promise<void>;
  /** 직전 사용자 질문을 다시 전송 (에러 후 재시도) */
  retry: (ctx: SendContext) => Promise<void>;
  confirmPreview: (card: Extract<SmartCard, { type: 'importPreview' }>, ctx: SendContext) => Promise<void>;
  confirmBankDeposits: (
    card: Extract<SmartCard, { type: 'bankDepositPreview' }>,
    selections: DepositSelection[],
    ctx: SendContext,
  ) => Promise<void>;
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
    // 클라우드: 요약은 토큰 상태이고 그 토큰의 의미는 메인 프로세스 볼트(세션 수명) 안에서만 유효하다.
    // 앱 재시작으로 볼트가 초기화되면 저장된 토큰 요약이 새로 발급되는 토큰과 충돌하므로,
    // 클라우드에선 요약을 영속화하지 않는다(세션 한정). 재시작 후엔 원문 메시지에서 다시 압축된다.
    saveHistory(s.loadedOrgId, {
      messages: s.messages,
      summary: s.cloudBackend ? '' : s.summary,
      summarizedCount: s.cloudBackend ? 0 : s.summarizedCount,
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
  cloudBackend: false,
  cloudConsent: loadCloudConsent(),
  usage: null,
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
        // 사용자 취소(취소/멈췄)는 정상 흐름 → 에러 스타일·재시도 버튼 없이 일반 안내로.
        const isCancel = /취소|멈췄/i.test(msg);
        set((state) => ({
          messages: [...state.messages, { role: 'assistant', content: msg, error: !isCancel }],
          streaming: false,
        }));
        scheduleSave();
        // 사용자 취소(abort)는 정상 흐름이라 로그 제외 — 그 외엔 error_logs에 자동 캡처.
        if (!isCancel) {
          void reportError(new Error(msg), 'ai-chat');
        }
      } else if (e.type === 'done') {
        set({ streaming: false });
        scheduleSave();
        // AI 페이지를 안 보고 있으면 사이드바에 완료 알림 표시
        useAiNotifyStore.getState().notifyAnswerDone();
      }
    });

    // 백엔드(로컬/클라우드) 확인 — 클라우드면 개인정보 동의 모달을 띄운다.
    (async () => {
      try {
        const info = await window.electronAPI.aiBackendInfo?.();
        if (info?.cloud) set({ cloudBackend: true });
      } catch {
        /* 구버전 preload 등 미지원 시 로컬로 간주 */
      }
    })();

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

  acceptCloudConsent: () => {
    try {
      localStorage.setItem(CLOUD_CONSENT_KEY, 'accepted');
    } catch {
      /* 저장 실패해도 이번 세션은 진행 */
    }
    set({ cloudConsent: true });
  },

  // 이번 달 클라우드 AI 사용량 갱신 — 클라우드 백엔드에서만 의미. 실패는 조용히 무시(부가 정보).
  // accessToken을 넘겨 메인이 프록시 인증에 쓰게 한다(첫 채팅 이전에도 조회 가능).
  refreshUsage: async (accessToken) => {
    if (!get().cloudBackend) return;
    try {
      const u = await window.electronAPI.aiUsage?.(accessToken ? { accessToken } : undefined);
      if (u) set({ usage: u });
    } catch {
      /* 사용량 표시는 부가 정보라 실패해도 채팅에 영향 없음 */
    }
  },

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

    // 클라우드: 이번 달 사용량을 갱신해 한도 임박/초과 배너를 최신화 (토큰 미소비, fire-and-forget)
    if (get().cloudBackend) void get().refreshUsage(ctx.accessToken);

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
            accessToken: ctx.accessToken, // 클라우드 백엔드 프록시 인증용
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
          messages: [...state.messages, { role: 'assistant', content: `확정 실패: ${r.error?.message}`, error: true }],
        }));
      } else {
        // AI 도구가 supabase에 직접 저장하므로 스토어 캐시를 갱신해야 화면에 반영됨
        await reloadAllStores();
      }
    } catch (e: any) {
      // 도구가 예외를 던지면(IPC reject) r.error가 아니라 throw로 온다 — 조용히 멈추지 말고 안내.
      set((state) => ({
        messages: [...state.messages, { role: 'assistant', content: `확정 실패: ${e?.message ?? '알 수 없는 오류'}`, error: true }],
      }));
    } finally {
      set({ streaming: false });
      scheduleSave();
    }
  },

  confirmBankDeposits: async (card, selections, ctx) => {
    set({ streaming: true });
    try {
      const r = await window.electronAPI.aiDispatch({
        toolName: 'confirmBankDeposits',
        args: { fileId: card.fileId, selections },
        orgId: ctx.orgId,
        userId: ctx.userId,
        accessToken: ctx.accessToken,
        refreshToken: ctx.refreshToken,
      });
      if (r.error) {
        set((state) => ({
          messages: [...state.messages, { role: 'assistant', content: `저장 실패: ${r.error?.message}`, error: true }],
        }));
      } else {
        // AI 도구가 supabase에 직접 저장하므로 스토어 캐시를 갱신해야 화면에 반영됨
        await reloadAllStores();
      }
    } catch (e: any) {
      set((state) => ({
        messages: [...state.messages, { role: 'assistant', content: `저장 실패: ${e?.message ?? '알 수 없는 오류'}`, error: true }],
      }));
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

  // 에러 후 재시도 — 마지막 사용자 질문 이후(그 메시지 + 실패 응답)를 제거하고 그대로 재전송.
  // send가 사용자 메시지를 다시 붙이므로 중복 없이 깔끔하게 재생성된다.
  retry: async (ctx) => {
    if (get().streaming) return;
    const msgs = get().messages;
    let ui = -1;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'user') { ui = i; break; }
    }
    if (ui < 0) return;
    const u = msgs[ui];
    const att = u.attachments?.[0];
    const attachment = att ? { fileId: att.fileId, name: att.name } : undefined;
    set({ messages: msgs.slice(0, ui) });
    await get().send(u.content ?? '', attachment, ctx);
  },

  reset: (orgId) => {
    set({ messages: [], summary: '', summarizedCount: 0, contextPercent: 0 });
    saveHistory(orgId, { messages: [], summary: '', summarizedCount: 0 });
    window.electronAPI.aiResetSession?.().catch(() => undefined);
  },
}));
