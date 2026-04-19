// 이벤트(감사) 로그 기록 유틸
// 모든 쓰기 action은 성공 직후 logEvent를 best-effort로 호출한다.
// 로깅 실패해도 원 action의 성공/실패와 독립 (try/catch 격리).

import { supabase } from '../config/supabase';
import { useAuthStore } from '../stores/authStore';
import type { EventLogEntityType, EventLogPayload } from '../types';
import { logWarn } from './logger';

export interface LogEventArgs {
  eventType: string;           // 'payment.add' 등 namespace.action
  entityType: EventLogEntityType;
  entityId?: string | null;
  entityLabel?: string | null;
  before?: unknown;
  after?: unknown;
  meta?: Record<string, unknown>;
}

/**
 * 이벤트 로그 1건 INSERT.
 * - 로깅은 동기 await이지만 try/catch로 원 action과 격리.
 * - 조직 id 없으면 skip (비로그인/로컬 모드에서 silently no-op).
 */
export async function logEvent(args: LogEventArgs): Promise<void> {
  try {
    if (!supabase) return; // supabase 미구성: 로컬 모드
    const { organizationId, session } = useAuthStore.getState();
    if (!organizationId) return; // 미인증: 로깅 건너뜀

    const user = session?.user;
    const actorLabel =
      (user?.user_metadata?.name as string | undefined) ||
      (user?.user_metadata?.full_name as string | undefined) ||
      user?.email ||
      'system';

    const payload: EventLogPayload = {};
    if (args.before !== undefined) payload.before = args.before;
    if (args.after !== undefined) payload.after = args.after;
    if (args.meta !== undefined) payload.meta = args.meta;

    const { error } = await supabase.from('event_logs').insert({
      organization_id: organizationId,
      actor_user_id: user?.id ?? null,
      actor_label: actorLabel,
      event_type: args.eventType,
      entity_type: args.entityType,
      entity_id: args.entityId ?? null,
      entity_label: args.entityLabel ?? null,
      payload,
    });

    if (error) {
      logWarn('event log insert failed', { data: { eventType: args.eventType, error: error.message } });
    }
  } catch (e) {
    // 본 action은 이미 성공했으므로 조용히 경고만
    logWarn('event log threw', { error: e, data: { eventType: args.eventType } });
  }
}

/**
 * before/after 중 실제로 변경된 필드만 추려서 기록용 객체로 반환.
 * payload 크기 최적화.
 */
export function diffChanges<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
): { before: Partial<T>; after: Partial<T> } {
  const b: Partial<T> = {};
  const a: Partial<T> = {};
  for (const key of Object.keys(after) as (keyof T)[]) {
    if (before[key] !== after[key]) {
      b[key] = before[key];
      a[key] = after[key];
    }
  }
  return { before: b, after: a };
}
