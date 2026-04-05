-- enrollment에 납부 기록이 있지만 payment_records가 없는 경우 보정
-- paidAmount > 0인 enrollment 중 payment_records가 없는 건에 대해 이력 생성
INSERT INTO payment_records (id, organization_id, enrollment_id, amount, paid_at, payment_method, notes, created_at)
SELECT
  gen_random_uuid(),
  e.organization_id,
  e.id,
  e.paid_amount,
  COALESCE(e.paid_at::date, e.enrolled_at::date),
  e.payment_method,
  NULL,
  COALESCE(e.paid_at::timestamptz, e.enrolled_at::timestamptz)
FROM enrollments e
WHERE e.paid_amount > 0
  AND e.payment_status != 'exempt'
  AND NOT EXISTS (
    SELECT 1 FROM payment_records pr WHERE pr.enrollment_id = e.id
  );
