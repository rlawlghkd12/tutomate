-- 수강생 테이블에 회원 여부 컬럼 추가
ALTER TABLE students ADD COLUMN is_member BOOLEAN DEFAULT false;
