-- user_organizations 삭제 정책 (로그아웃 시 org 연결 해제)
CREATE POLICY "uo_delete" ON user_organizations FOR DELETE USING (user_id = auth.uid());
