-- monthly_payments INSERT (courseId+studentId로 enrollment_id 매핑)
WITH local_payments AS (
  SELECT 'f8abda61-0b25-41dc-9b85-ec2b01941064'::uuid as course_id, '70f6544f-a96b-4658-bae6-340d4fa88492'::uuid as student_id, '2026-03' as month, 60000 as amount, '2026-02-12'::date as paid_at, 'transfer' as payment_method, 'paid' as status, NULL as notes, '2026-03-10T23:56:20.637Z'::timestamptz as created_at
  UNION ALL
  SELECT 'f8abda61-0b25-41dc-9b85-ec2b01941064'::uuid as course_id, '5c62ba87-4066-4fd9-8e2b-92210d72f8df'::uuid as student_id, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, 'transfer' as payment_method, 'paid' as status, NULL as notes, '2026-03-10T23:56:20.741Z'::timestamptz as created_at
  UNION ALL
  SELECT 'f8abda61-0b25-41dc-9b85-ec2b01941064'::uuid as course_id, '65787f5f-f1e1-49ae-beb4-8db4b53b2060'::uuid as student_id, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, 'transfer' as payment_method, 'paid' as status, NULL as notes, '2026-03-10T23:56:20.837Z'::timestamptz as created_at
  UNION ALL
  SELECT 'f8abda61-0b25-41dc-9b85-ec2b01941064'::uuid as course_id, '85453490-cc1d-4064-9c87-4d6b240e4394'::uuid as student_id, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, 'transfer' as payment_method, 'paid' as status, NULL as notes, '2026-03-10T23:56:20.944Z'::timestamptz as created_at
  UNION ALL
  SELECT 'f8abda61-0b25-41dc-9b85-ec2b01941064'::uuid as course_id, '796b9acc-91bc-480a-80ec-f41cd2427c42'::uuid as student_id, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, 'transfer' as payment_method, 'paid' as status, NULL as notes, '2026-03-10T23:56:21.034Z'::timestamptz as created_at
  UNION ALL
  SELECT 'f8abda61-0b25-41dc-9b85-ec2b01941064'::uuid as course_id, 'c595ceb9-c232-4e83-9daf-3f678026b5d0'::uuid as student_id, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, 'transfer' as payment_method, 'paid' as status, NULL as notes, '2026-03-10T23:56:21.119Z'::timestamptz as created_at
  UNION ALL
  SELECT 'f8abda61-0b25-41dc-9b85-ec2b01941064'::uuid as course_id, 'b4453e21-bfe8-4b31-9c1c-c405f66903c5'::uuid as student_id, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, 'transfer' as payment_method, 'paid' as status, NULL as notes, '2026-03-10T23:56:21.209Z'::timestamptz as created_at
  UNION ALL
  SELECT 'f8abda61-0b25-41dc-9b85-ec2b01941064'::uuid as course_id, 'a2a34666-563f-45e2-85ac-1196e8f2b026'::uuid as student_id, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, 'transfer' as payment_method, 'paid' as status, NULL as notes, '2026-03-10T23:56:21.292Z'::timestamptz as created_at
  UNION ALL
  SELECT 'f8abda61-0b25-41dc-9b85-ec2b01941064'::uuid as course_id, '59488a19-ca0d-449e-91fa-9ce7ac0f536f'::uuid as student_id, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, 'transfer' as payment_method, 'paid' as status, NULL as notes, '2026-03-10T23:56:21.380Z'::timestamptz as created_at
  UNION ALL
  SELECT 'f8abda61-0b25-41dc-9b85-ec2b01941064'::uuid as course_id, '72ff87fe-fa4f-491d-bbcc-c6b7237bcdb7'::uuid as student_id, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, 'transfer' as payment_method, 'paid' as status, NULL as notes, '2026-03-10T23:56:21.467Z'::timestamptz as created_at
  UNION ALL
  SELECT 'f8abda61-0b25-41dc-9b85-ec2b01941064'::uuid as course_id, '8337d2f9-9a56-4a5a-a7bd-0decc06bcc54'::uuid as student_id, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, 'transfer' as payment_method, 'paid' as status, NULL as notes, '2026-03-10T23:56:21.551Z'::timestamptz as created_at
  UNION ALL
  SELECT 'f8abda61-0b25-41dc-9b85-ec2b01941064'::uuid as course_id, '14f9056a-fa44-4f53-b797-3ae9a62eed7c'::uuid as student_id, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, 'transfer' as payment_method, 'paid' as status, NULL as notes, '2026-03-10T23:56:21.636Z'::timestamptz as created_at
  UNION ALL
  SELECT 'f8abda61-0b25-41dc-9b85-ec2b01941064'::uuid as course_id, '6ddb4620-48a0-4f97-b6b0-07c5c9ea7f49'::uuid as student_id, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, 'transfer' as payment_method, 'paid' as status, NULL as notes, '2026-03-10T23:56:21.721Z'::timestamptz as created_at
  UNION ALL
  SELECT 'f8abda61-0b25-41dc-9b85-ec2b01941064'::uuid as course_id, 'aa82f77e-1161-468f-967d-cdca88174cd6'::uuid as student_id, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, 'transfer' as payment_method, 'paid' as status, NULL as notes, '2026-03-10T23:56:21.803Z'::timestamptz as created_at
  UNION ALL
  SELECT 'f8abda61-0b25-41dc-9b85-ec2b01941064'::uuid as course_id, 'fa916312-7509-4f26-934f-f638e36f3465'::uuid as student_id, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, 'transfer' as payment_method, 'paid' as status, NULL as notes, '2026-03-10T23:56:21.885Z'::timestamptz as created_at
  UNION ALL
  SELECT 'f8abda61-0b25-41dc-9b85-ec2b01941064'::uuid as course_id, '4c411dd9-0223-4fec-89ae-eb796327b682'::uuid as student_id, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, 'transfer' as payment_method, 'paid' as status, NULL as notes, '2026-03-10T23:56:21.964Z'::timestamptz as created_at
  UNION ALL
  SELECT 'f8abda61-0b25-41dc-9b85-ec2b01941064'::uuid as course_id, 'f06e81df-fdce-47cc-b29d-9b06a1f8c88a'::uuid as student_id, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, 'transfer' as payment_method, 'paid' as status, NULL as notes, '2026-03-10T23:56:22.047Z'::timestamptz as created_at
  UNION ALL
  SELECT 'f8abda61-0b25-41dc-9b85-ec2b01941064'::uuid as course_id, 'e93e9aae-050a-492a-a67d-316b77a7a3c4'::uuid as student_id, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, 'transfer' as payment_method, 'paid' as status, NULL as notes, '2026-03-10T23:56:22.127Z'::timestamptz as created_at
  UNION ALL
  SELECT 'f8abda61-0b25-41dc-9b85-ec2b01941064'::uuid as course_id, 'ad29c037-7df3-48c3-9b9b-73e966534d8f'::uuid as student_id, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, 'transfer' as payment_method, 'paid' as status, NULL as notes, '2026-03-10T23:56:22.210Z'::timestamptz as created_at
  UNION ALL
  SELECT 'f8abda61-0b25-41dc-9b85-ec2b01941064'::uuid as course_id, '880047eb-488b-4d68-919a-56852c17ee59'::uuid as student_id, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, 'transfer' as payment_method, 'paid' as status, NULL as notes, '2026-03-10T23:56:22.291Z'::timestamptz as created_at
  UNION ALL
  SELECT 'f8abda61-0b25-41dc-9b85-ec2b01941064'::uuid as course_id, '701a62bd-46ca-4f15-9467-587c535d06d2'::uuid as student_id, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, 'transfer' as payment_method, 'paid' as status, NULL as notes, '2026-03-10T23:56:22.395Z'::timestamptz as created_at
  UNION ALL
  SELECT 'f8abda61-0b25-41dc-9b85-ec2b01941064'::uuid as course_id, '08aa65dd-40fe-4345-8a64-d83df9a8a31c'::uuid as student_id, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, 'transfer' as payment_method, 'paid' as status, NULL as notes, '2026-03-10T23:56:22.475Z'::timestamptz as created_at
  UNION ALL
  SELECT 'f8abda61-0b25-41dc-9b85-ec2b01941064'::uuid as course_id, 'a451cf49-852b-4c38-b184-0d2141833d77'::uuid as student_id, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, 'transfer' as payment_method, 'paid' as status, NULL as notes, '2026-03-10T23:56:22.562Z'::timestamptz as created_at
  UNION ALL
  SELECT 'f8abda61-0b25-41dc-9b85-ec2b01941064'::uuid as course_id, '5a838c13-7dd0-4f41-9afe-89df692835cc'::uuid as student_id, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, 'transfer' as payment_method, 'paid' as status, NULL as notes, '2026-03-10T23:56:22.646Z'::timestamptz as created_at
  UNION ALL
  SELECT 'f8abda61-0b25-41dc-9b85-ec2b01941064'::uuid as course_id, '7db5e52c-b037-4cb2-b19f-67daac2dc26d'::uuid as student_id, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, 'transfer' as payment_method, 'paid' as status, NULL as notes, '2026-03-10T23:56:22.725Z'::timestamptz as created_at
  UNION ALL
  SELECT 'e5226b85-4307-4cc4-8c57-31b3efd24fb2'::uuid as course_id, '668e099c-88b6-4469-bb48-bf1eb2293b88'::uuid as student_id, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, 'transfer' as payment_method, 'paid' as status, NULL as notes, '2026-03-10T23:58:16.204Z'::timestamptz as created_at
  UNION ALL
  SELECT 'e5226b85-4307-4cc4-8c57-31b3efd24fb2'::uuid as course_id, 'e5100642-21e1-425b-aba7-1177c3eeb64d'::uuid as student_id, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, 'transfer' as payment_method, 'paid' as status, NULL as notes, '2026-03-10T23:58:16.263Z'::timestamptz as created_at
  UNION ALL
  SELECT 'e5226b85-4307-4cc4-8c57-31b3efd24fb2'::uuid as course_id, '4756b709-e6a0-48e4-b2c0-4638c3d2f8be'::uuid as student_id, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, 'transfer' as payment_method, 'paid' as status, NULL as notes, '2026-03-10T23:58:16.322Z'::timestamptz as created_at
  UNION ALL
  SELECT 'e5226b85-4307-4cc4-8c57-31b3efd24fb2'::uuid as course_id, 'b072dcb7-2715-47f1-ae0b-9de31a484d1f'::uuid as student_id, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, 'transfer' as payment_method, 'paid' as status, NULL as notes, '2026-03-10T23:58:16.380Z'::timestamptz as created_at
  UNION ALL
  SELECT 'e5226b85-4307-4cc4-8c57-31b3efd24fb2'::uuid as course_id, '9c280fbe-2cad-487e-ad72-0b63b1138c1a'::uuid as student_id, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, 'transfer' as payment_method, 'paid' as status, NULL as notes, '2026-03-10T23:58:16.440Z'::timestamptz as created_at
  UNION ALL
  SELECT 'e5226b85-4307-4cc4-8c57-31b3efd24fb2'::uuid as course_id, 'ef5d59d2-9621-4302-ae55-c87f5a09da6d'::uuid as student_id, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, 'transfer' as payment_method, 'paid' as status, NULL as notes, '2026-03-10T23:58:16.506Z'::timestamptz as created_at
  UNION ALL
  SELECT 'e5226b85-4307-4cc4-8c57-31b3efd24fb2'::uuid as course_id, 'cf5e30fd-9414-4ec9-8338-c67f3b25a0d3'::uuid as student_id, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, 'transfer' as payment_method, 'paid' as status, NULL as notes, '2026-03-10T23:58:16.568Z'::timestamptz as created_at
  UNION ALL
  SELECT 'e5226b85-4307-4cc4-8c57-31b3efd24fb2'::uuid as course_id, '46f93862-9c1f-431b-9d24-40983241c90d'::uuid as student_id, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, 'transfer' as payment_method, 'paid' as status, NULL as notes, '2026-03-10T23:58:16.629Z'::timestamptz as created_at
  UNION ALL
  SELECT 'e5226b85-4307-4cc4-8c57-31b3efd24fb2'::uuid as course_id, '170bb9d4-e28b-4a56-954f-ddb06839e14d'::uuid as student_id, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, 'transfer' as payment_method, 'paid' as status, NULL as notes, '2026-03-10T23:58:16.689Z'::timestamptz as created_at
  UNION ALL
  SELECT 'e5226b85-4307-4cc4-8c57-31b3efd24fb2'::uuid as course_id, '23217aed-0117-4890-bf30-2818851252a6'::uuid as student_id, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, 'transfer' as payment_method, 'paid' as status, NULL as notes, '2026-03-10T23:58:16.750Z'::timestamptz as created_at
  UNION ALL
  SELECT 'e5226b85-4307-4cc4-8c57-31b3efd24fb2'::uuid as course_id, 'b32dad60-73d2-4539-ac29-7ccff559cf05'::uuid as student_id, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, 'transfer' as payment_method, 'paid' as status, NULL as notes, '2026-03-10T23:58:16.810Z'::timestamptz as created_at
  UNION ALL
  SELECT 'e5226b85-4307-4cc4-8c57-31b3efd24fb2'::uuid as course_id, '650afd84-ae3e-49f3-bfb8-bbd5999fe450'::uuid as student_id, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, 'transfer' as payment_method, 'paid' as status, NULL as notes, '2026-03-10T23:58:16.866Z'::timestamptz as created_at
  UNION ALL
  SELECT 'e5226b85-4307-4cc4-8c57-31b3efd24fb2'::uuid as course_id, '1e92119b-f54e-4072-a3ac-39ce477b1491'::uuid as student_id, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, 'transfer' as payment_method, 'paid' as status, NULL as notes, '2026-03-10T23:58:16.927Z'::timestamptz as created_at
  UNION ALL
  SELECT 'e5226b85-4307-4cc4-8c57-31b3efd24fb2'::uuid as course_id, 'c4cdb969-a212-42e4-a6e0-ac3d935737f3'::uuid as student_id, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, 'transfer' as payment_method, 'paid' as status, NULL as notes, '2026-03-10T23:58:16.985Z'::timestamptz as created_at
  UNION ALL
  SELECT 'e5226b85-4307-4cc4-8c57-31b3efd24fb2'::uuid as course_id, 'b2b185d6-0b1d-4608-9ee7-fedea57e6a42'::uuid as student_id, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, 'transfer' as payment_method, 'paid' as status, NULL as notes, '2026-03-10T23:58:17.045Z'::timestamptz as created_at
  UNION ALL
  SELECT 'e5226b85-4307-4cc4-8c57-31b3efd24fb2'::uuid as course_id, 'b93448e3-9e63-41bb-b3f7-ae34313e6c28'::uuid as student_id, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, 'transfer' as payment_method, 'paid' as status, NULL as notes, '2026-03-10T23:58:17.104Z'::timestamptz as created_at
  UNION ALL
  SELECT '8fd680ee-d393-4d58-870d-767e3b837a93'::uuid as course_id, 'b072dcb7-2715-47f1-ae0b-9de31a484d1f'::uuid as student_id, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, NULL as payment_method, 'paid' as status, NULL as notes, '2026-03-11T00:00:46.257Z'::timestamptz as created_at
  UNION ALL
  SELECT '8fd680ee-d393-4d58-870d-767e3b837a93'::uuid as course_id, 'f7be7ab3-c32e-449a-8b54-90ffd646e588'::uuid as student_id, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, NULL as payment_method, 'paid' as status, NULL as notes, '2026-03-11T00:00:46.303Z'::timestamptz as created_at
  UNION ALL
  SELECT '8fd680ee-d393-4d58-870d-767e3b837a93'::uuid as course_id, '2447f115-0d29-4dcb-9841-90b2d128500c'::uuid as student_id, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, NULL as payment_method, 'paid' as status, NULL as notes, '2026-03-11T00:00:46.353Z'::timestamptz as created_at
  UNION ALL
  SELECT '8fd680ee-d393-4d58-870d-767e3b837a93'::uuid as course_id, 'e9604f59-daa6-45b9-abe1-83d796859bae'::uuid as student_id, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, NULL as payment_method, 'paid' as status, NULL as notes, '2026-03-11T00:00:46.397Z'::timestamptz as created_at
  UNION ALL
  SELECT '8fd680ee-d393-4d58-870d-767e3b837a93'::uuid as course_id, '05d03ace-ec6d-4ee4-8487-ca0087db1ed2'::uuid as student_id, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, NULL as payment_method, 'paid' as status, NULL as notes, '2026-03-11T00:00:46.442Z'::timestamptz as created_at
  UNION ALL
  SELECT '8fd680ee-d393-4d58-870d-767e3b837a93'::uuid as course_id, '23ec4042-c7f7-4d62-82eb-7bc2d810f884'::uuid as student_id, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, NULL as payment_method, 'paid' as status, NULL as notes, '2026-03-11T00:00:46.488Z'::timestamptz as created_at
  UNION ALL
  SELECT '8fd680ee-d393-4d58-870d-767e3b837a93'::uuid as course_id, 'fbddc372-8fc4-452e-93b6-951016ade163'::uuid as student_id, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, NULL as payment_method, 'paid' as status, NULL as notes, '2026-03-11T00:00:46.537Z'::timestamptz as created_at
  UNION ALL
  SELECT '8fd680ee-d393-4d58-870d-767e3b837a93'::uuid as course_id, 'be796a31-14a9-4526-be0a-4ead99d3df90'::uuid as student_id, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, NULL as payment_method, 'paid' as status, NULL as notes, '2026-03-11T00:00:46.582Z'::timestamptz as created_at
  UNION ALL
  SELECT '8fd680ee-d393-4d58-870d-767e3b837a93'::uuid as course_id, '3c909009-4a8e-4c1b-b29a-e27a07d0d8d8'::uuid as student_id, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, NULL as payment_method, 'paid' as status, NULL as notes, '2026-03-11T00:00:46.627Z'::timestamptz as created_at
  UNION ALL
  SELECT '8fd680ee-d393-4d58-870d-767e3b837a93'::uuid as course_id, '6aa6517b-f93a-4292-b2ba-037d7050f9a3'::uuid as student_id, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, NULL as payment_method, 'paid' as status, NULL as notes, '2026-03-11T00:00:46.673Z'::timestamptz as created_at
  UNION ALL
  SELECT '8fd680ee-d393-4d58-870d-767e3b837a93'::uuid as course_id, 'f52eedf1-5aeb-41aa-9eb4-f5d088c8ab65'::uuid as student_id, '2026-03' as month, 60000 as amount, '2026-03-11'::date as paid_at, NULL as payment_method, 'paid' as status, NULL as notes, '2026-03-11T00:00:46.718Z'::timestamptz as created_at
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
JOIN enrollments e ON e.course_id = lp.course_id AND e.student_id = lp.student_id AND e.organization_id = '85a37f47-7c4e-4c70-842d-379fd184d8a5'
ON CONFLICT (enrollment_id, month) DO NOTHING;