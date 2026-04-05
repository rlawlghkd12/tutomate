-- 분기별 납부 이력 테이블 (monthly_payments 대체)
CREATE TABLE IF NOT EXISTS payment_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  enrollment_id UUID NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  paid_at DATE NOT NULL,
  payment_method TEXT, -- 'cash', 'card', 'transfer'
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_payment_records_enrollment_id ON payment_records(enrollment_id);
CREATE INDEX IF NOT EXISTS idx_payment_records_org_id ON payment_records(organization_id);

-- RLS 정책
ALTER TABLE payment_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payment_records_org_isolation" ON payment_records
  USING (organization_id = current_setting('app.organization_id')::uuid);

CREATE POLICY "payment_records_insert" ON payment_records
  FOR INSERT WITH CHECK (organization_id = current_setting('app.organization_id')::uuid);

CREATE POLICY "payment_records_update" ON payment_records
  FOR UPDATE USING (organization_id = current_setting('app.organization_id')::uuid);

CREATE POLICY "payment_records_delete" ON payment_records
  FOR DELETE USING (organization_id = current_setting('app.organization_id')::uuid);

-- 기존 monthly_payments → payment_records 데이터 이관
INSERT INTO payment_records (id, organization_id, enrollment_id, amount, paid_at, payment_method, notes, created_at)
SELECT id, organization_id, enrollment_id, amount, paid_at, payment_method, notes, created_at
FROM monthly_payments
WHERE amount > 0 AND status = 'paid' AND paid_at IS NOT NULL;
