/**
 * OpenRouter 백엔드 설정 — 모델 무종속 개발용.
 *
 * 모델 최종 선택은 서버(프록시 env)가 관리하지만, A/B 후보와 기본값을
 * 여기에 상수로 두어 클라이언트/문서가 같은 목록을 참조하게 한다.
 * 모델 교체는 프록시 env(OPENROUTER_MODEL) 또는 A/B override로 이뤄지며 앱 재배포 불필요.
 */

/**
 * A/B 후보 (id는 OpenRouter 모델 slug). 2026-09-02 실측으로 존재·가격 검증된 슬러그.
 * 이전 미검증 슬러그(deepseek-v4-flash 무버전, gemini-2.5/3.1-flash-lite)는 제거.
 * 임포트 LLM은 DeepSeek 단일(저신뢰 폴백 gemini-3.5-flash-lite). 참고: docs/MODELS-ai-payment-import.md.
 */
export const OPENROUTER_CANDIDATES = [
  'qwen/qwen3-30b-a3b',
  'deepseek/deepseek-v4-flash-0731',
  'google/gemini-3.5-flash-lite',
] as const;

export type OpenRouterCandidate = (typeof OPENROUTER_CANDIDATES)[number];

/** 기본 모델 — 한국어·연속성 기준(현 로컬이 Qwen 계열). 프록시가 최종 결정. */
export const OPENROUTER_DEFAULT_MODEL: OpenRouterCandidate = 'qwen/qwen3-30b-a3b';

/** 'openrouter'면 원격 백엔드, 그 외/미설정이면 기존 로컬 llama 사용(기본). */
export function getAiBackend(): 'openrouter' | 'llama' {
  return process.env.TUTOMATE_AI_BACKEND === 'openrouter' ? 'openrouter' : 'llama';
}

/**
 * ai-proxy Edge Function URL.
 * 우선순위: 명시적 env → SUPABASE_URL 기반 유도. 없으면 null(→ 로컬로 폴백).
 */
export function getAiProxyUrl(): string | null {
  const explicit = process.env.TUTOMATE_AI_PROXY_URL;
  if (explicit) return explicit;
  const base = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  return base ? `${base.replace(/\/$/, '')}/functions/v1/ai-proxy` : null;
}

/** A/B override 모델 (없으면 프록시 기본값 사용). */
export function getAiModelOverride(): string | undefined {
  const m = process.env.TUTOMATE_AI_MODEL;
  return m && (OPENROUTER_CANDIDATES as readonly string[]).includes(m) ? m : undefined;
}
