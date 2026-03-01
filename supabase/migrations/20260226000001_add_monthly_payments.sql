-- 월별 납부 기록 테이블
CREATE TABLE IF NOT EXISTS monthly_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  enrollment_id UUID NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  month TEXT NOT NULL, -- YYYY-MM 형식
  amount INTEGER NOT NULL DEFAULT 0,
  paid_at DATE,
  payment_method TEXT, -- 'cash', 'card', 'transfer'
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'paid'
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- 동일 수강에 대해 같은 월 중복 방지
  UNIQUE(enrollment_id, month)
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_monthly_payments_enrollment_id ON monthly_payments(enrollment_id);
CREATE INDEX IF NOT EXISTS idx_monthly_payments_month ON monthly_payments(month);
CREATE INDEX IF NOT EXISTS idx_monthly_payments_org_id ON monthly_payments(organization_id);

-- RLS 정책
ALTER TABLE monthly_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "monthly_payments_org_isolation" ON monthly_payments
  USING (organization_id = current_setting('app.organization_id')::uuid);

CREATE POLICY "monthly_payments_insert" ON monthly_payments
  FOR INSERT WITH CHECK (organization_id = current_setting('app.organization_id')::uuid);

CREATE POLICY "monthly_payments_update" ON monthly_payments
  FOR UPDATE USING (organization_id = current_setting('app.organization_id')::uuid);

CREATE POLICY "monthly_payments_delete" ON monthly_payments
  FOR DELETE USING (organization_id = current_setting('app.organization_id')::uuid);
