-- organizations 테이블에 로컬 데이터 백업용 JSONB 컬럼 추가
-- 체험판 유저의 로컬 JSON 원본을 마이그레이션 전 통째로 저장
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS local_backup jsonb;

COMMENT ON COLUMN organizations.local_backup IS '마이그레이션 전 로컬 JSON 원본 백업 (courses, students, enrollments, monthly_payments)';
