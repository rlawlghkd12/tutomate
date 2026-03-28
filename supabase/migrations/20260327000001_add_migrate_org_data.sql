-- 체험판 → 라이선스 활성화 시 데이터 마이그레이션 함수
-- SECURITY DEFINER로 RLS 우회하여 organization_id 일괄 변경
-- 호출자가 new_org_id에 속한 사용자인지 검증
CREATE OR REPLACE FUNCTION migrate_org_data(old_org_id UUID, new_org_id UUID)
RETURNS void AS $$
BEGIN
  -- 권한 검증: 호출자가 new_org_id에 연결된 사용자여야 함
  IF NOT EXISTS (
    SELECT 1 FROM user_organizations
    WHERE user_id = auth.uid() AND organization_id = new_org_id
  ) THEN
    RAISE EXCEPTION 'unauthorized: caller does not belong to target organization';
  END IF;

  -- 동일 org 방어
  IF old_org_id = new_org_id THEN
    RETURN;
  END IF;

  UPDATE courses SET organization_id = new_org_id WHERE organization_id = old_org_id;
  UPDATE students SET organization_id = new_org_id WHERE organization_id = old_org_id;
  UPDATE enrollments SET organization_id = new_org_id WHERE organization_id = old_org_id;
  UPDATE monthly_payments SET organization_id = new_org_id WHERE organization_id = old_org_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
