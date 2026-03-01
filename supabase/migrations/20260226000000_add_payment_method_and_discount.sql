-- 납부 방법 컬럼 추가 (현금, 카드, 계좌이체)
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS payment_method TEXT;

-- 할인 금액 컬럼 추가
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS discount_amount INTEGER NOT NULL DEFAULT 0;

-- 기존 데이터 납부 방법 기본값 설정 (현금)
UPDATE enrollments SET payment_method = 'cash' WHERE payment_method IS NULL;
