-- 엑셀 임포트 컬럼 매핑 캐시
create table if not exists mapping_profiles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  signature text not null,
  mapping jsonb not null,
  created_at timestamptz not null default now(),
  unique (org_id, signature)
);

create index if not exists idx_mapping_profiles_org on mapping_profiles(org_id);

alter table mapping_profiles enable row level security;

create policy "org members read mapping_profiles"
  on mapping_profiles for select
  using (org_id in (select org_id from org_members where user_id = auth.uid()));

create policy "org members insert mapping_profiles"
  on mapping_profiles for insert
  with check (org_id in (select org_id from org_members where user_id = auth.uid()));
