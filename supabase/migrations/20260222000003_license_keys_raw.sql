-- 원본 키 컬럼 추가 (service_role만 접근 가능하므로 안전)
ALTER TABLE license_keys ADD COLUMN key TEXT;
