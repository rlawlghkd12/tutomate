-- monthly_payments RLS 정책을 get_user_org_id()로 통일
-- 기존 current_setting('app.organization_id') 방식은 클라이언트 SDK에서 작동하지 않음

DROP POLICY IF EXISTS "monthly_payments_org_isolation" ON monthly_payments;
DROP POLICY IF EXISTS "monthly_payments_insert" ON monthly_payments;
DROP POLICY IF EXISTS "monthly_payments_update" ON monthly_payments;
DROP POLICY IF EXISTS "monthly_payments_delete" ON monthly_payments;

CREATE POLICY "monthly_payments_select" ON monthly_payments
  FOR SELECT USING (organization_id = get_user_org_id());

CREATE POLICY "monthly_payments_insert" ON monthly_payments
  FOR INSERT WITH CHECK (organization_id = get_user_org_id());

CREATE POLICY "monthly_payments_update" ON monthly_payments
  FOR UPDATE USING (organization_id = get_user_org_id());

CREATE POLICY "monthly_payments_delete" ON monthly_payments
  FOR DELETE USING (organization_id = get_user_org_id());
