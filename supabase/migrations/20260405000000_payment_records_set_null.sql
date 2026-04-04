-- payment_records: enrollment 삭제 시 기록은 남기고 enrollment_id만 null로
ALTER TABLE payment_records
  DROP CONSTRAINT IF EXISTS payment_records_enrollment_id_fkey;

ALTER TABLE payment_records
  ALTER COLUMN enrollment_id DROP NOT NULL;

ALTER TABLE payment_records
  ADD CONSTRAINT payment_records_enrollment_id_fkey
  FOREIGN KEY (enrollment_id) REFERENCES enrollments(id) ON DELETE SET NULL;
