-- 기존 enrollment에 quarter 필드 백필
-- enrolled_at 기준으로 분기 계산: 1-3월=Q1, 4-6월=Q2, 7-9월=Q3, 10-12월=Q4
update enrollments
set quarter = extract(year from enrolled_at::date)::text
  || '-Q'
  || ceil(extract(month from enrolled_at::date) / 3.0)::int::text
where quarter is null
  and enrolled_at is not null;
