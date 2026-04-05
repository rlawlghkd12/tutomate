-- payment_records RLS 정책을 다른 테이블과 동일하게 get_user_org_id() 사용으로 변경
DROP POLICY IF EXISTS "payment_records_org_isolation" ON payment_records;
DROP POLICY IF EXISTS "payment_records_insert" ON payment_records;
DROP POLICY IF EXISTS "payment_records_update" ON payment_records;
DROP POLICY IF EXISTS "payment_records_delete" ON payment_records;

CREATE POLICY "payment_records_select" ON payment_records
  FOR SELECT USING (organization_id = get_user_org_id());

CREATE POLICY "payment_records_insert" ON payment_records
  FOR INSERT WITH CHECK (organization_id = get_user_org_id());

CREATE POLICY "payment_records_update" ON payment_records
  FOR UPDATE USING (organization_id = get_user_org_id());

CREATE POLICY "payment_records_delete" ON payment_records
  FOR DELETE USING (organization_id = get_user_org_id());
