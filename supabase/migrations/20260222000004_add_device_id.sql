-- device_id 컬럼 추가 (기기 중복 방지)
ALTER TABLE user_organizations ADD COLUMN device_id TEXT;

CREATE INDEX idx_user_org_device ON user_organizations(device_id);

-- 같은 조직 내 같은 기기는 하나의 레코드만 허용
CREATE UNIQUE INDEX idx_user_org_device_unique
  ON user_organizations(organization_id, device_id)
  WHERE device_id IS NOT NULL;
