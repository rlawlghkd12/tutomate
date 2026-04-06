-- 1. organizations.license_key nullable 변경
ALTER TABLE organizations ALTER COLUMN license_key DROP NOT NULL;

-- 2. user_organizations PK를 복합키로 변경 + is_active 추가
ALTER TABLE user_organizations DROP CONSTRAINT user_organizations_pkey;
ALTER TABLE user_organizations ADD PRIMARY KEY (user_id, organization_id);
ALTER TABLE user_organizations ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;

-- 유저당 active 조직 1개만 허용
CREATE UNIQUE INDEX idx_user_active_org ON user_organizations (user_id) WHERE is_active = true;

-- 3. get_user_org_id() 함수 수정 (RLS 정책 자동 반영)
CREATE OR REPLACE FUNCTION get_user_org_id()
RETURNS UUID AS $$
  SELECT organization_id FROM user_organizations
  WHERE user_id = auth.uid() AND is_active = true
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 4. org_invites 테이블 신규
CREATE TABLE org_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  expires_at TIMESTAMPTZ,
  max_uses INTEGER DEFAULT 0,
  used_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE org_invites ENABLE ROW LEVEL SECURITY;
