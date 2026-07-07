// ai-proxy 순수 결정 로직 — Deno/네트워크 의존 없음.
// index.ts(Deno 런타임)와 vitest(node) 양쪽에서 임포트해 단위 테스트 가능하게 분리.

// 기획서 §5 확정 A/B 후보. 이 목록 밖의 모델은 거부.
export const ALLOWED_MODELS = [
  'qwen/qwen3-30b-a3b',
  'deepseek/deepseek-v4-flash',
  'google/gemini-2.5-flash-lite',
  'google/gemini-3.1-flash-lite',
] as const;

/** 요청 모델이 allowlist에 있으면 그대로, 아니면 기본 모델로 강제. */
export function selectModel(requested: unknown, defaultModel: string): string {
  return typeof requested === 'string' && (ALLOWED_MODELS as readonly string[]).includes(requested)
    ? requested
    : defaultModel;
}

export interface OrgLinkRow {
  organization_id: string;
  role?: string | null;
  is_active?: boolean | null;
}

/** 활성 조직 우선순위: active → owner → 첫 번째. 없으면 null. authStore와 동일 규칙. */
export function pickActiveOrgId(rows: OrgLinkRow[] | null | undefined): string | null {
  if (!rows || rows.length === 0) return null;
  const active = rows.find((r) => r.is_active);
  const owner = rows.find((r) => r.role === 'owner');
  return (active ?? owner ?? rows[0]).organization_id ?? null;
}

/** 최근 창(window) 요청 수가 한도 이상이면 true. limit<=0이면 rate limit 비활성(항상 false). */
export function isRateLimited(recentCount: number, limitPerWindow: number): boolean {
  return limitPerWindow > 0 && recentCount >= limitPerWindow;
}

export interface UsageTokens {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  /** 프롬프트 캐시에서 읽은 입력 토큰 수(있을 때만). OpenRouter가 usage에 함께 반환. */
  prompt_tokens_details?: { cached_tokens?: number };
  /** 이 요청의 실제 비용(USD). OpenRouter가 usage.cost로 반환. */
  cost?: number;
}

/**
 * SSE 한 줄에서 usage(토큰)를 추출. `data: {json}` 형태이며 payload에 usage가 있을 때만 반환.
 * `data: [DONE]`·비 data 라인·malformed JSON은 null.
 */
export function usageFromDataLine(line: string): UsageTokens | null {
  if (!line.startsWith('data: ')) return null;
  const data = line.slice(6).trim();
  if (data === '[DONE]' || data === '') return null;
  try {
    const ev = JSON.parse(data);
    return ev?.usage ?? null;
  } catch {
    return null;
  }
}

export interface UsageSummary {
  /** 이번 달 누적 토큰 */
  used: number;
  /** 월 한도(토큰). 0이면 무제한(한도 비활성). */
  cap: number;
  /** 집계 단위 — 활성 조직이 있으면 'org', 없으면 개인 'user'. */
  scope: 'org' | 'user';
  /** 소진율 0~100(정수). cap<=0(무제한)이면 항상 0. */
  percent: number;
  /** 남은 토큰. 무제한이면 null. 음수는 0으로 클램프. */
  remaining: number | null;
  /** UI 경고 단계 — none(<80%) · warn(80~99%) · exceeded(>=100%). 무제한이면 none. */
  level: 'none' | 'warn' | 'exceeded';
}

/**
 * 월 사용량을 UI가 바로 쓸 수 있는 요약으로 변환(순수 계산).
 * cap<=0은 "무제한"으로 간주 — percent 0, remaining null, level none.
 * 경고 임계값은 80%(warn)·100%(exceeded)로 402 하드컷 이전에 미리 알릴 수 있게 한다.
 */
export function summarizeUsage(used: number, cap: number, scope: 'org' | 'user'): UsageSummary {
  const safeUsed = Number.isFinite(used) && used > 0 ? Math.floor(used) : 0;
  if (!Number.isFinite(cap) || cap <= 0) {
    return { used: safeUsed, cap: 0, scope, percent: 0, remaining: null, level: 'none' };
  }
  const percent = Math.min(100, Math.floor((safeUsed / cap) * 100));
  const remaining = Math.max(0, cap - safeUsed);
  const level: UsageSummary['level'] = safeUsed >= cap ? 'exceeded' : percent >= 80 ? 'warn' : 'none';
  return { used: safeUsed, cap, scope, percent, remaining, level };
}
