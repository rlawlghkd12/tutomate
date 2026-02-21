-- 라이선스 키 해시 테이블 (Gist 대체)
CREATE TABLE license_keys (
  key_hash TEXT PRIMARY KEY,
  plan TEXT NOT NULL DEFAULT 'basic',
  memo TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- service_role만 접근 (Edge Function에서 사용)
ALTER TABLE license_keys ENABLE ROW LEVEL SECURITY;
-- anon/authenticated 유저는 직접 조회 불가, Edge Function이 service_role로 조회
