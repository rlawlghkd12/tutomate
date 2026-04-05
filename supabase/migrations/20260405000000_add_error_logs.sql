create table if not exists error_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  organization_id uuid,
  app_version text,
  app_name text,
  error_message text not null,
  error_stack text,
  component text,
  page_url text,
  user_agent text,
  created_at timestamptz default now()
);

-- 누구나 insert 가능 (자기 에러 기록), admin만 select
alter table error_logs enable row level security;

create policy "Users can insert own errors"
  on error_logs for insert
  with check (auth.uid() = user_id);

create policy "Admin can read all errors"
  on error_logs for select
  using (true);
