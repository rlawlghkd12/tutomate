-- monthly_payments INSERT (course_name + student_name으로 enrollment_id 매핑)
WITH local_payments AS (
  SELECT '드럼' as course_name, '김상길' as student_name, '2026-03' as month, 60000 as amount, '2026-02-12'::date as paid_at, 'transfer' as payment_method, 'paid' as status, NULL as notes, '2026-03-10T23:56:20.637Z'::timestamptz as created_at
  UNION ALL
  SELECT '드럼' as course_name, '김명일' as student_name, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, 'transfer' as payment_method, 'paid' as status, NULL as notes, '2026-03-10T23:56:20.741Z'::timestamptz as created_at
  UNION ALL
  SELECT '드럼' as course_name, '김상집' as student_name, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, 'transfer' as payment_method, 'paid' as status, NULL as notes, '2026-03-10T23:56:20.837Z'::timestamptz as created_at
  UNION ALL
  SELECT '드럼' as course_name, '김승일' as student_name, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, 'transfer' as payment_method, 'paid' as status, NULL as notes, '2026-03-10T23:56:20.944Z'::timestamptz as created_at
  UNION ALL
  SELECT '드럼' as course_name, '김자용' as student_name, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, 'transfer' as payment_method, 'paid' as status, NULL as notes, '2026-03-10T23:56:21.034Z'::timestamptz as created_at
  UNION ALL
  SELECT '드럼' as course_name, '김재석' as student_name, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, 'transfer' as payment_method, 'paid' as status, NULL as notes, '2026-03-10T23:56:21.119Z'::timestamptz as created_at
  UNION ALL
  SELECT '드럼' as course_name, '박상원' as student_name, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, 'transfer' as payment_method, 'paid' as status, NULL as notes, '2026-03-10T23:56:21.209Z'::timestamptz as created_at
  UNION ALL
  SELECT '드럼' as course_name, '박성희' as student_name, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, 'transfer' as payment_method, 'paid' as status, NULL as notes, '2026-03-10T23:56:21.292Z'::timestamptz as created_at
  UNION ALL
  SELECT '드럼' as course_name, '손숙희' as student_name, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, 'transfer' as payment_method, 'paid' as status, NULL as notes, '2026-03-10T23:56:21.380Z'::timestamptz as created_at
  UNION ALL
  SELECT '드럼' as course_name, '신현미' as student_name, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, 'transfer' as payment_method, 'paid' as status, NULL as notes, '2026-03-10T23:56:21.467Z'::timestamptz as created_at
  UNION ALL
  SELECT '드럼' as course_name, '신환석' as student_name, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, 'transfer' as payment_method, 'paid' as status, NULL as notes, '2026-03-10T23:56:21.551Z'::timestamptz as created_at
  UNION ALL
  SELECT '드럼' as course_name, '우호철' as student_name, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, 'transfer' as payment_method, 'paid' as status, NULL as notes, '2026-03-10T23:56:21.636Z'::timestamptz as created_at
  UNION ALL
  SELECT '드럼' as course_name, '윤옥희' as student_name, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, 'transfer' as payment_method, 'paid' as status, NULL as notes, '2026-03-10T23:56:21.721Z'::timestamptz as created_at
  UNION ALL
  SELECT '드럼' as course_name, '이경자' as student_name, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, 'transfer' as payment_method, 'paid' as status, NULL as notes, '2026-03-10T23:56:21.803Z'::timestamptz as created_at
  UNION ALL
  SELECT '드럼' as course_name, '이나겸' as student_name, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, 'transfer' as payment_method, 'paid' as status, NULL as notes, '2026-03-10T23:56:21.885Z'::timestamptz as created_at
  UNION ALL
  SELECT '드럼' as course_name, '이연홍' as student_name, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, 'transfer' as payment_method, 'paid' as status, NULL as notes, '2026-03-10T23:56:21.964Z'::timestamptz as created_at
  UNION ALL
  SELECT '드럼' as course_name, '이영미' as student_name, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, 'transfer' as payment_method, 'paid' as status, NULL as notes, '2026-03-10T23:56:22.047Z'::timestamptz as created_at
  UNION ALL
  SELECT '드럼' as course_name, '이지완' as student_name, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, 'transfer' as payment_method, 'paid' as status, NULL as notes, '2026-03-10T23:56:22.127Z'::timestamptz as created_at
  UNION ALL
  SELECT '드럼' as course_name, '오정민' as student_name, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, 'transfer' as payment_method, 'paid' as status, NULL as notes, '2026-03-10T23:56:22.210Z'::timestamptz as created_at
  UNION ALL
  SELECT '드럼' as course_name, '장복희' as student_name, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, 'transfer' as payment_method, 'paid' as status, NULL as notes, '2026-03-10T23:56:22.291Z'::timestamptz as created_at
  UNION ALL
  SELECT '드럼' as course_name, '장영옥' as student_name, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, 'transfer' as payment_method, 'paid' as status, NULL as notes, '2026-03-10T23:56:22.395Z'::timestamptz as created_at
  UNION ALL
  SELECT '드럼' as course_name, '주미희' as student_name, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, 'transfer' as payment_method, 'paid' as status, NULL as notes, '2026-03-10T23:56:22.475Z'::timestamptz as created_at
  UNION ALL
  SELECT '드럼' as course_name, '지관우' as student_name, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, 'transfer' as payment_method, 'paid' as status, NULL as notes, '2026-03-10T23:56:22.562Z'::timestamptz as created_at
  UNION ALL
  SELECT '드럼' as course_name, '황경숙' as student_name, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, 'transfer' as payment_method, 'paid' as status, NULL as notes, '2026-03-10T23:56:22.646Z'::timestamptz as created_at
  UNION ALL
  SELECT '드럼' as course_name, '현정아' as student_name, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, 'transfer' as payment_method, 'paid' as status, NULL as notes, '2026-03-10T23:56:22.725Z'::timestamptz as created_at
  UNION ALL
  SELECT '숟가락난타' as course_name, '박묘심' as student_name, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, 'transfer' as payment_method, 'paid' as status, NULL as notes, '2026-03-10T23:58:16.204Z'::timestamptz as created_at
  UNION ALL
  SELECT '숟가락난타' as course_name, '강재숙' as student_name, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, 'transfer' as payment_method, 'paid' as status, NULL as notes, '2026-03-10T23:58:16.263Z'::timestamptz as created_at
  UNION ALL
  SELECT '숟가락난타' as course_name, '강정선' as student_name, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, 'transfer' as payment_method, 'paid' as status, NULL as notes, '2026-03-10T23:58:16.322Z'::timestamptz as created_at
  UNION ALL
  SELECT '숟가락난타' as course_name, '김신정' as student_name, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, 'transfer' as payment_method, 'paid' as status, NULL as notes, '2026-03-10T23:58:16.380Z'::timestamptz as created_at
  UNION ALL
  SELECT '숟가락난타' as course_name, '김영숙' as student_name, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, 'transfer' as payment_method, 'paid' as status, NULL as notes, '2026-03-10T23:58:16.440Z'::timestamptz as created_at
  UNION ALL
  SELECT '숟가락난타' as course_name, '김정희' as student_name, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, 'transfer' as payment_method, 'paid' as status, NULL as notes, '2026-03-10T23:58:16.506Z'::timestamptz as created_at
  UNION ALL
  SELECT '숟가락난타' as course_name, '김진효' as student_name, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, 'transfer' as payment_method, 'paid' as status, NULL as notes, '2026-03-10T23:58:16.568Z'::timestamptz as created_at
  UNION ALL
  SELECT '숟가락난타' as course_name, '박순애' as student_name, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, 'transfer' as payment_method, 'paid' as status, NULL as notes, '2026-03-10T23:58:16.629Z'::timestamptz as created_at
  UNION ALL
  SELECT '숟가락난타' as course_name, '양창수' as student_name, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, 'transfer' as payment_method, 'paid' as status, NULL as notes, '2026-03-10T23:58:16.689Z'::timestamptz as created_at
  UNION ALL
  SELECT '숟가락난타' as course_name, '우춘조' as student_name, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, 'transfer' as payment_method, 'paid' as status, NULL as notes, '2026-03-10T23:58:16.750Z'::timestamptz as created_at
  UNION ALL
  SELECT '숟가락난타' as course_name, '윤영진' as student_name, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, 'transfer' as payment_method, 'paid' as status, NULL as notes, '2026-03-10T23:58:16.810Z'::timestamptz as created_at
  UNION ALL
  SELECT '숟가락난타' as course_name, '안혜정' as student_name, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, 'transfer' as payment_method, 'paid' as status, NULL as notes, '2026-03-10T23:58:16.866Z'::timestamptz as created_at
  UNION ALL
  SELECT '숟가락난타' as course_name, '정국진' as student_name, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, 'transfer' as payment_method, 'paid' as status, NULL as notes, '2026-03-10T23:58:16.927Z'::timestamptz as created_at
  UNION ALL
  SELECT '숟가락난타' as course_name, '나영혜' as student_name, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, 'transfer' as payment_method, 'paid' as status, NULL as notes, '2026-03-10T23:58:16.985Z'::timestamptz as created_at
  UNION ALL
  SELECT '숟가락난타' as course_name, '라순남' as student_name, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, 'transfer' as payment_method, 'paid' as status, NULL as notes, '2026-03-10T23:58:17.045Z'::timestamptz as created_at
  UNION ALL
  SELECT '숟가락난타' as course_name, '송금옥' as student_name, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, 'transfer' as payment_method, 'paid' as status, NULL as notes, '2026-03-10T23:58:17.104Z'::timestamptz as created_at
  UNION ALL
  SELECT '사군자' as course_name, '김신정' as student_name, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, NULL as payment_method, 'paid' as status, NULL as notes, '2026-03-11T00:00:46.257Z'::timestamptz as created_at
  UNION ALL
  SELECT '사군자' as course_name, '김영자' as student_name, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, NULL as payment_method, 'paid' as status, NULL as notes, '2026-03-11T00:00:46.303Z'::timestamptz as created_at
  UNION ALL
  SELECT '사군자' as course_name, '김일곤' as student_name, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, NULL as payment_method, 'paid' as status, NULL as notes, '2026-03-11T00:00:46.353Z'::timestamptz as created_at
  UNION ALL
  SELECT '사군자' as course_name, '백남이' as student_name, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, NULL as payment_method, 'paid' as status, NULL as notes, '2026-03-11T00:00:46.397Z'::timestamptz as created_at
  UNION ALL
  SELECT '사군자' as course_name, '안길수' as student_name, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, NULL as payment_method, 'paid' as status, NULL as notes, '2026-03-11T00:00:46.442Z'::timestamptz as created_at
  UNION ALL
  SELECT '사군자' as course_name, '이숙희' as student_name, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, NULL as payment_method, 'paid' as status, NULL as notes, '2026-03-11T00:00:46.488Z'::timestamptz as created_at
  UNION ALL
  SELECT '사군자' as course_name, '이은영' as student_name, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, NULL as payment_method, 'paid' as status, NULL as notes, '2026-03-11T00:00:46.537Z'::timestamptz as created_at
  UNION ALL
  SELECT '사군자' as course_name, '정경숙' as student_name, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, NULL as payment_method, 'paid' as status, NULL as notes, '2026-03-11T00:00:46.582Z'::timestamptz as created_at
  UNION ALL
  SELECT '사군자' as course_name, '정선영\' as student_name, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, NULL as payment_method, 'paid' as status, NULL as notes, '2026-03-11T00:00:46.627Z'::timestamptz as created_at
  UNION ALL
  SELECT '사군자' as course_name, '최윤영' as student_name, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, NULL as payment_method, 'paid' as status, NULL as notes, '2026-03-11T00:00:46.673Z'::timestamptz as created_at
  UNION ALL
  SELECT '사군자' as course_name, '홍성임' as student_name, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, NULL as payment_method, 'paid' as status, NULL as notes, '2026-03-11T00:00:46.718Z'::timestamptz as created_at
)
INSERT INTO monthly_payments (organization_id, enrollment_id, month, amount, paid_at, payment_method, status, notes, created_at)
SELECT 
  '85a37f47-7c4e-4c70-842d-379fd184d8a5',
  e.id,
  lp.month,
  lp.amount,
  lp.paid_at,
  lp.payment_method,
  lp.status,
  lp.notes,
  lp.created_at
FROM local_payments lp
JOIN courses c ON c.name = lp.course_name AND c.organization_id = '85a37f47-7c4e-4c70-842d-379fd184d8a5'
JOIN students s ON s.name = lp.student_name AND s.organization_id = '85a37f47-7c4e-4c70-842d-379fd184d8a5'
JOIN enrollments e ON e.course_id = c.id AND e.student_id = s.id AND e.organization_id = '85a37f47-7c4e-4c70-842d-379fd184d8a5'
ON CONFLICT (enrollment_id, month) DO NOTHING;