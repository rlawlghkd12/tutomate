-- 분기별 수강 관리 컬럼 추가
ALTER TABLE enrollments ADD COLUMN quarter TEXT;
ALTER TABLE enrollments ADD COLUMN enrolled_months JSONB DEFAULT '[]';
