-- AI 사용량 로그 — OpenRouter 프록시(ai-proxy)가 요청별 토큰 사용량을 기록.
-- 비용 추적 + 플랜별 월 한도 판정에 사용. 프롬프트 원문은 저장하지 않음(개인정보 최소화).

create table if not exists ai_usage_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  organization_id uuid,
  model text not null,
  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  total_tokens integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_usage_user_created on ai_usage_logs (user_id, created_at);
create index if not exists idx_ai_usage_org_created on ai_usage_logs (organization_id, created_at);

alter table ai_usage_logs enable row level security;

-- 서비스 롤(Edge Function)이 insert 하므로 insert 정책 불필요(RLS 우회).
-- 사용자는 자기 사용량만 조회 가능.
create policy "Users read own ai usage"
  on ai_usage_logs for select
  using (auth.uid() = user_id);

-- 이번 달(월초부터) 사용자 누적 토큰 — 프록시의 월 한도 판정용.
create or replace function ai_usage_month_total(p_user uuid)
returns bigint
language sql
stable
as $$
  select coalesce(sum(total_tokens), 0)::bigint
  from ai_usage_logs
  where user_id = p_user
    and created_at >= date_trunc('month', now());
$$;

-- 이번 달(월초부터) 조직 누적 토큰 — 조직 단위 월 한도 판정용.
-- 프록시는 사용자의 활성 조직을 확인해 조직이 있으면 조직 합계로, 없으면 사용자 합계로 캡을 건다.
create or replace function ai_usage_month_total_org(p_org uuid)
returns bigint
language sql
stable
as $$
  select coalesce(sum(total_tokens), 0)::bigint
  from ai_usage_logs
  where organization_id = p_org
    and created_at >= date_trunc('month', now());
$$;

-- 최근 p_seconds초 동안의 완료 요청 수 — 초당/분당 rate limit(429) 판정용.
-- 로그는 요청 완료 시 1행 기록되므로 최근 행 수 ≈ 최근 완료 요청 수.
-- 조직이 있으면 조직 단위로, 없으면 사용자 단위로 집계한다.
create or replace function ai_usage_recent_count(p_user uuid, p_org uuid, p_seconds int)
returns bigint
language sql
stable
as $$
  select count(*)::bigint
  from ai_usage_logs
  where created_at >= now() - make_interval(secs => p_seconds)
    and (case when p_org is not null then organization_id = p_org else user_id = p_user end);
$$;

-- 최소 권한 — 이 집계 함수들은 오직 서비스 롤(ai-proxy)만 호출한다.
-- 데이터는 RLS로도 보호되지만(일반 사용자는 자기 행만), 함수 실행 표면 자체를 서비스 롤로 좁혀
-- 향후 RLS 정책이 바뀌더라도 조직 단위 집계(사용량·과금)가 외부로 새지 않도록 이중 방어한다.
revoke execute on function ai_usage_month_total(uuid) from public, anon, authenticated;
revoke execute on function ai_usage_month_total_org(uuid) from public, anon, authenticated;
revoke execute on function ai_usage_recent_count(uuid, uuid, int) from public, anon, authenticated;
grant execute on function ai_usage_month_total(uuid) to service_role;
grant execute on function ai_usage_month_total_org(uuid) to service_role;
grant execute on function ai_usage_recent_count(uuid, uuid, int) to service_role;
