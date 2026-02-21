-- RLS 활성화
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollments ENABLE ROW LEVEL SECURITY;

-- 현재 유저의 organization_id 조회 함수
CREATE OR REPLACE FUNCTION get_user_org_id()
RETURNS UUID AS $$
  SELECT organization_id FROM user_organizations WHERE user_id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- organizations 정책
CREATE POLICY "org_select" ON organizations FOR SELECT USING (id = get_user_org_id());
CREATE POLICY "org_update" ON organizations FOR UPDATE USING (id = get_user_org_id());

-- user_organizations 정책
CREATE POLICY "uo_select" ON user_organizations FOR SELECT USING (user_id = auth.uid());

-- courses 정책
CREATE POLICY "courses_select" ON courses FOR SELECT USING (organization_id = get_user_org_id());
CREATE POLICY "courses_insert" ON courses FOR INSERT WITH CHECK (organization_id = get_user_org_id());
CREATE POLICY "courses_update" ON courses FOR UPDATE USING (organization_id = get_user_org_id());
CREATE POLICY "courses_delete" ON courses FOR DELETE USING (organization_id = get_user_org_id());

-- students 정책
CREATE POLICY "students_select" ON students FOR SELECT USING (organization_id = get_user_org_id());
CREATE POLICY "students_insert" ON students FOR INSERT WITH CHECK (organization_id = get_user_org_id());
CREATE POLICY "students_update" ON students FOR UPDATE USING (organization_id = get_user_org_id());
CREATE POLICY "students_delete" ON students FOR DELETE USING (organization_id = get_user_org_id());

-- enrollments 정책
CREATE POLICY "enrollments_select" ON enrollments FOR SELECT USING (organization_id = get_user_org_id());
CREATE POLICY "enrollments_insert" ON enrollments FOR INSERT WITH CHECK (organization_id = get_user_org_id());
CREATE POLICY "enrollments_update" ON enrollments FOR UPDATE USING (organization_id = get_user_org_id());
CREATE POLICY "enrollments_delete" ON enrollments FOR DELETE USING (organization_id = get_user_org_id());
