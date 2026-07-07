-- 실제 비용 로깅 — OpenRouter usage.cost(USD)를 그대로 기록.
-- 토큰 기반 추정 대신 실비를 저장해 조직별/일별 지출을 정확히 추적(관리자 대시보드·과금 기반).
alter table ai_usage_logs add column if not exists cost numeric(12, 6) not null default 0;
