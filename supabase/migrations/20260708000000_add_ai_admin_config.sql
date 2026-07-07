-- 관리자 AI 설정 — 모델·한도 등을 JSON으로 보관해 프록시 재배포 없이 변경.
-- 프록시(ai-proxy)가 요청 시 이 값을 읽어 모델·월한도·분당한도·일일한도를 결정한다.

create table if not exists ai_admin_config (
  id text primary key default 'global',
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

alter table ai_admin_config enable row level security;
-- 프록시는 서비스 롤로 읽어 RLS를 우회한다. 일반 사용자 접근은 정책 없음으로 차단.
-- (관리자 UI 쓰기 정책은 추후 admin 판정 로직과 함께 추가)

-- 조직별(없으면 사용자별) "오늘"(Asia/Seoul 자정 기준) AI 호출 수 — 일일 호출 한도 판정용.
-- 로그는 요청 완료 시 1행 기록되므로 오늘 행 수 ≈ 오늘 호출 수.
create or replace function ai_usage_today_count_org(p_org uuid, p_user uuid)
returns bigint
language sql
stable
as $$
  select count(*)::bigint
  from ai_usage_logs
  where created_at >= (date_trunc('day', (now() at time zone 'Asia/Seoul')) at time zone 'Asia/Seoul')
    and (case when p_org is not null then organization_id = p_org else user_id = p_user end);
$$;

revoke execute on function ai_usage_today_count_org(uuid, uuid) from public, anon, authenticated;
grant execute on function ai_usage_today_count_org(uuid, uuid) to service_role;

-- 초기 설정 시드 — 모델(gemini-3.1-flash-lite) + 조직당 하루 500건 + 월 500만 토큰.
-- 이미 있으면 덮어쓰지 않는다(추후 관리자가 바꾼 값 보존).
insert into ai_admin_config (id, config) values (
  'global',
  '{"model":"google/gemini-3.1-flash-lite","dailyMaxCalls":500,"monthlyTokenCap":5000000,"ratePerMin":0}'::jsonb
) on conflict (id) do nothing;
