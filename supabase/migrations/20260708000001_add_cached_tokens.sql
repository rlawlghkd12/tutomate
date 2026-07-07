-- 프롬프트 캐시 히트 측정 — OpenRouter usage.prompt_tokens_details.cached_tokens 기록.
-- 캐시된 입력 토큰은 정가의 일부(예: Gemini 0.25배)만 과금되므로, 실효 비용·캐시율 추적용.
alter table ai_usage_logs add column if not exists cached_tokens integer not null default 0;
