-- 이벤트(감사) 로그 테이블
-- 모든 쓰기 작업을 INSERT-only로 기록하여 사후 추적 가능하게 한다.
-- SELECT는 차단되며, admin 앱의 Edge Function이 service role로만 조회한다.

CREATE TABLE IF NOT EXISTS event_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_label TEXT NOT NULL DEFAULT 'system',
  event_type TEXT NOT NULL,                 -- 'payment.add' | 'enrollment.withdraw' ...
  entity_type TEXT NOT NULL,                -- 'payment_record' | 'enrollment' | 'student' | 'course'
  entity_id UUID,
  entity_label TEXT,                        -- "김남희 — 숟가락난타" 등 표시용 snapshot
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 인덱스: 조직별 최근순 조회 + 엔티티별 타임라인 조회
CREATE INDEX IF NOT EXISTS idx_event_logs_org_time ON event_logs(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_logs_entity ON event_logs(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_logs_type_time ON event_logs(event_type, created_at DESC);

-- RLS
ALTER TABLE event_logs ENABLE ROW LEVEL SECURITY;

-- INSERT: 자기 조직 이벤트만 기록 가능 (기존 stores RLS 패턴과 동일)
CREATE POLICY "event_logs_insert_org_scoped" ON event_logs
  FOR INSERT WITH CHECK (organization_id = current_setting('app.organization_id')::uuid);

-- SELECT: 일반 앱에서는 전면 차단. admin 앱은 Edge Function(service role)로 조회한다.
CREATE POLICY "event_logs_select_deny" ON event_logs
  FOR SELECT USING (false);

-- UPDATE/DELETE 정책 없음 → 불변 로그 강제
