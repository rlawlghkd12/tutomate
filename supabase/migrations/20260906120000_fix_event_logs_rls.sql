-- event_logs RLS 수정
--
-- 문제: INSERT 정책이 세팅되지 않는 GUC `app.organization_id`를 요구해
--       모든 감사 로그(payment.add 등)가 조용히 거부돼 왔다(event_logs 전체 0건 확인).
-- 수정: 다른 테이블과 동일하게 get_user_org_id()(로그인 JWT 기반)로 교체.
-- 추가: 앱 내 '처리 내역' 화면에서 자기 조직 로그를 조회할 수 있도록 org 범위 SELECT 허용.
--       (기존엔 전면 차단 → admin edge function만 조회)
-- 불변성: UPDATE/DELETE 정책은 두지 않아 로그는 append-only로 유지된다.

-- INSERT: 자기 조직 이벤트만 기록 (기존 stores/payment_records RLS 패턴과 동일)
drop policy if exists "event_logs_insert_org_scoped" on event_logs;
create policy "event_logs_insert_org_scoped" on event_logs
  for insert with check (organization_id = get_user_org_id());

-- SELECT: 자기 조직 로그만 조회 가능 (전면 차단 정책 대체)
drop policy if exists "event_logs_select_deny" on event_logs;
drop policy if exists "event_logs_select_org_scoped" on event_logs;
create policy "event_logs_select_org_scoped" on event_logs
  for select using (organization_id = get_user_org_id());
