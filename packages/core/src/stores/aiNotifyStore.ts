import { create } from 'zustand';

/**
 * AI 답변 완료 알림 상태.
 * 사용자가 AI 페이지를 보고 있지 않을 때 답변이 완료되면 사이드바에 표시할 unread 플래그를 켠다.
 */
interface AiNotifyStore {
  /** 읽지 않은 완료 답변 존재 여부 (사이드바 알림 표시용) */
  unread: boolean;
  /** 현재 AI 페이지를 보고 있는지 */
  viewing: boolean;
  /** AI 페이지 진입/이탈 — 진입 시 unread 해제 */
  setViewing: (v: boolean) => void;
  /** 답변 완료 — 페이지를 안 보고 있을 때만 알림 표시 */
  notifyAnswerDone: () => void;
  clear: () => void;
}

export const useAiNotifyStore = create<AiNotifyStore>((set, get) => ({
  unread: false,
  viewing: false,
  setViewing: (v) => set(v ? { viewing: true, unread: false } : { viewing: false }),
  notifyAnswerDone: () => {
    if (!get().viewing) set({ unread: true });
  },
  clear: () => set({ unread: false }),
}));
