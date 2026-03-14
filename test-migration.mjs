/**
 * 마이그레이션 + 백업/복원 로직 통합 테스트
 *
 * Tauri 없이 Node.js에서 Supabase SDK로 직접 테스트
 * - 익명 로그인 → trial org 생성 → 목 데이터 마이그레이션 → DB 검증
 * - pre-migration cleanup (idempotent) → 재마이그레이션 검증
 * - 테스트 후 정리
 *
 * 실행: node test-migration.mjs
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://hjrtjyjmlrhqzeviodak.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_ZRlIM50RDyWK6OkHWWmVFw_Re3zOCg7';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

// ─── 목(Mock) 데이터 ───────────────────────────────────────
function createMockData() {
  const courseId1 = crypto.randomUUID();
  const courseId2 = crypto.randomUUID();
  const studentId1 = crypto.randomUUID();
  const studentId2 = crypto.randomUUID();
  const studentId3 = crypto.randomUUID();
  const enrollId1 = crypto.randomUUID();
  const enrollId2 = crypto.randomUUID();
  const enrollId3 = crypto.randomUUID();

  const courses = [
    {
      id: courseId1,
      name: '피아노 초급반',
      classroom: '101호',
      instructorName: '김선생',
      instructorPhone: '010-1111-2222',
      fee: 150000,
      maxStudents: 10,
      currentStudents: 2,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    },
    {
      id: courseId2,
      name: '기타 중급반',
      classroom: '202호',
      instructorName: '박선생',
      instructorPhone: '010-3333-4444',
      fee: 200000,
      maxStudents: 8,
      currentStudents: 1,
      createdAt: '2025-02-01T00:00:00Z',
      updatedAt: '2025-02-01T00:00:00Z',
    },
  ];

  const students = [
    {
      id: studentId1,
      name: '이수진',
      phone: '010-5555-6666',
      email: 'sujin@test.com',
      birthDate: '2000-05-15',
      createdAt: '2025-01-10T00:00:00Z',
      updatedAt: '2025-01-10T00:00:00Z',
    },
    {
      id: studentId2,
      name: '정민호',
      phone: '010-7777-8888',
      notes: '초보자',
      createdAt: '2025-01-15T00:00:00Z',
      updatedAt: '2025-01-15T00:00:00Z',
    },
    {
      id: studentId3,
      name: '박지은',
      phone: '010-9999-0000',
      address: '서울시 강남구',
      createdAt: '2025-02-01T00:00:00Z',
      updatedAt: '2025-02-01T00:00:00Z',
    },
  ];

  const enrollments = [
    {
      id: enrollId1,
      courseId: courseId1,
      studentId: studentId1,
      enrolledAt: '2025-01-10',
      paymentStatus: 'completed',
      paidAmount: 150000,
      remainingAmount: 0,
      paidAt: '2025-01-10',
      paymentMethod: 'card',
      discountAmount: 0,
    },
    {
      id: enrollId2,
      courseId: courseId1,
      studentId: studentId2,
      enrolledAt: '2025-01-15',
      paymentStatus: 'pending',
      paidAmount: 0,
      remainingAmount: 150000,
      discountAmount: 0,
    },
    {
      id: enrollId3,
      courseId: courseId2,
      studentId: studentId3,
      enrolledAt: '2025-02-01',
      paymentStatus: 'partial',
      paidAmount: 100000,
      remainingAmount: 100000,
      paymentMethod: 'transfer',
      discountAmount: 0,
    },
  ];

  const monthlyPayments = [
    {
      id: crypto.randomUUID(),
      enrollmentId: enrollId1,
      month: '2025-01',
      amount: 150000,
      paidAt: '2025-01-10',
      paymentMethod: 'card',
      status: 'paid',
      createdAt: '2025-01-10T00:00:00Z',
    },
    {
      id: crypto.randomUUID(),
      enrollmentId: enrollId3,
      month: '2025-02',
      amount: 100000,
      paidAt: '2025-02-05',
      paymentMethod: 'transfer',
      status: 'paid',
      createdAt: '2025-02-05T00:00:00Z',
    },
    {
      id: crypto.randomUUID(),
      enrollmentId: enrollId2,
      month: '2025-01',
      amount: 0,
      status: 'pending',
      createdAt: '2025-01-15T00:00:00Z',
    },
  ];

  return { courses, students, enrollments, monthlyPayments };
}

// ─── camelCase → snake_case 매퍼 (fieldMapper.ts 재현) ─────
function mapCourseToDb(c, orgId) {
  return {
    id: c.id, organization_id: orgId, name: c.name, classroom: c.classroom,
    instructor_name: c.instructorName, instructor_phone: c.instructorPhone,
    fee: c.fee, max_students: c.maxStudents, current_students: c.currentStudents,
    schedule: c.schedule ?? null,
  };
}

function mapStudentToDb(s, orgId) {
  return {
    id: s.id, organization_id: orgId, name: s.name, phone: s.phone,
    email: s.email ?? null, address: s.address ?? null,
    birth_date: s.birthDate ?? null, notes: s.notes ?? null,
  };
}

function mapEnrollmentToDb(e, orgId) {
  return {
    id: e.id, organization_id: orgId, course_id: e.courseId, student_id: e.studentId,
    enrolled_at: e.enrolledAt, payment_status: e.paymentStatus,
    paid_amount: e.paidAmount, remaining_amount: e.remainingAmount,
    paid_at: e.paidAt ?? null, payment_method: e.paymentMethod ?? null,
    discount_amount: e.discountAmount ?? 0, notes: e.notes ?? null,
    created_at: e.enrolledAt,
  };
}

function mapMonthlyPaymentToDb(mp, orgId) {
  return {
    id: mp.id, organization_id: orgId, enrollment_id: mp.enrollmentId,
    month: mp.month, amount: mp.amount, paid_at: mp.paidAt ?? null,
    payment_method: mp.paymentMethod ?? null, status: mp.status,
    notes: mp.notes ?? null, created_at: mp.createdAt,
  };
}

// ─── snake_case → camelCase 매퍼 (fromDb 재현) ────────────
function mapCourseFromDb(row) {
  return {
    id: row.id, name: row.name, classroom: row.classroom,
    instructorName: row.instructor_name, instructorPhone: row.instructor_phone,
    fee: row.fee, maxStudents: row.max_students, currentStudents: row.current_students,
    schedule: row.schedule ?? undefined,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

function mapStudentFromDb(row) {
  return {
    id: row.id, name: row.name, phone: row.phone,
    email: row.email ?? undefined, address: row.address ?? undefined,
    birthDate: row.birth_date ?? undefined, notes: row.notes ?? undefined,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

function mapEnrollmentFromDb(row) {
  return {
    id: row.id, courseId: row.course_id, studentId: row.student_id,
    enrolledAt: row.enrolled_at, paymentStatus: row.payment_status,
    paidAmount: row.paid_amount, remainingAmount: row.remaining_amount,
    paidAt: row.paid_at ?? undefined, paymentMethod: row.payment_method ?? undefined,
    discountAmount: row.discount_amount ?? 0, notes: row.notes ?? undefined,
  };
}

function mapMonthlyPaymentFromDb(row) {
  return {
    id: row.id, enrollmentId: row.enrollment_id, month: row.month,
    amount: row.amount, paidAt: row.paid_at ?? undefined,
    paymentMethod: row.payment_method ?? undefined, status: row.status,
    notes: row.notes ?? undefined, createdAt: row.created_at,
  };
}

// ─── 헬퍼 ──────────────────────────────────────────────────
let testOrgId = null;
let testUserId = null;
let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    console.log(`  ✅ ${msg}`);
    passed++;
  } else {
    console.log(`  ❌ FAIL: ${msg}`);
    failed++;
  }
}

async function cleanupOrg(orgId) {
  const tables = ['monthly_payments', 'enrollments', 'students', 'courses'];
  for (const table of tables) {
    const { error } = await supabase.from(table).delete().eq('organization_id', orgId);
    if (error) console.log(`  ⚠️ cleanup ${table}: ${error.message}`);
  }
}

// ─── 테스트 1: 익명 로그인 + trial org 생성 ─────────────────
async function test01_anonLoginAndTrialOrg() {
  console.log('\n🧪 테스트 1: 익명 로그인 + trial org 생성');

  const { data, error } = await supabase.auth.signInAnonymously();
  assert(!error, `익명 로그인 성공`);
  assert(!!data.session, `세션 생성됨`);
  testUserId = data.session.user.id;
  console.log(`   userId: ${testUserId}`);

  // device_id 생성 (테스트용 랜덤)
  const deviceId = crypto.randomUUID().replace(/-/g, '');

  const { data: trialData, error: trialError } = await supabase.functions.invoke(
    'create-trial-org',
    { body: { device_id: deviceId } },
  );

  assert(!trialError, `Edge Function 호출 성공`);
  assert(!!trialData?.organization_id, `organization_id 반환됨: ${trialData?.organization_id}`);
  assert(trialData?.plan === 'trial', `plan = trial`);
  assert(trialData?.is_new_org === true, `is_new_org = true`);

  testOrgId = trialData?.organization_id;

  // user_organizations 확인
  const { data: orgLink } = await supabase
    .from('user_organizations')
    .select('organization_id')
    .eq('user_id', testUserId)
    .single();

  assert(orgLink?.organization_id === testOrgId, `user_organizations 연결 확인`);
}

// ─── 테스트 2: 목 데이터 마이그레이션 (migrateLocalToCloud 시뮬레이션) ──
async function test02_migrateLocalToCloud() {
  console.log('\n🧪 테스트 2: 목 데이터 → Supabase 마이그레이션');

  const { courses, students, enrollments, monthlyPayments } = createMockData();

  // ID 리매핑 (실제 마이그레이션 로직과 동일)
  const courseIdMap = new Map();
  const studentIdMap = new Map();
  const enrollmentIdMap = new Map();

  // 1. courses
  const courseRows = courses.map(c => {
    const newId = crypto.randomUUID();
    courseIdMap.set(c.id, newId);
    return mapCourseToDb({ ...c, id: newId }, testOrgId);
  });
  const { error: courseErr } = await supabase.from('courses').insert(courseRows);
  assert(!courseErr, `courses insert (${courseRows.length}건) — ${courseErr?.message || 'OK'}`);

  // 2. students
  const studentRows = students.map(s => {
    const newId = crypto.randomUUID();
    studentIdMap.set(s.id, newId);
    return mapStudentToDb({ ...s, id: newId }, testOrgId);
  });
  const { error: studentErr } = await supabase.from('students').insert(studentRows);
  assert(!studentErr, `students insert (${studentRows.length}건) — ${studentErr?.message || 'OK'}`);

  // 3. enrollments (FK 리매핑)
  const enrollRows = enrollments.map(e => {
    const newId = crypto.randomUUID();
    enrollmentIdMap.set(e.id, newId);
    return mapEnrollmentToDb({
      ...e,
      id: newId,
      courseId: courseIdMap.get(e.courseId) || e.courseId,
      studentId: studentIdMap.get(e.studentId) || e.studentId,
    }, testOrgId);
  });
  const { error: enrollErr } = await supabase.from('enrollments').insert(enrollRows);
  assert(!enrollErr, `enrollments insert (${enrollRows.length}건) — ${enrollErr?.message || 'OK'}`);

  // 4. monthly_payments (FK 리매핑)
  const paymentRows = monthlyPayments.map(mp => {
    const newId = crypto.randomUUID();
    return mapMonthlyPaymentToDb({
      ...mp,
      id: newId,
      enrollmentId: enrollmentIdMap.get(mp.enrollmentId) || mp.enrollmentId,
    }, testOrgId);
  });
  const { error: paymentErr } = await supabase.from('monthly_payments').insert(paymentRows);
  assert(!paymentErr, `monthly_payments insert (${paymentRows.length}건) — ${paymentErr?.message || 'OK'}`);
}

// ─── 테스트 3: DB에서 데이터 읽기 + 검증 ────────────────────
async function test03_verifyDbData() {
  console.log('\n🧪 테스트 3: DB 데이터 읽기 + 검증');

  const { data: courses, error: cErr } = await supabase.from('courses').select('*');
  assert(!cErr, `courses select 성공`);
  assert(courses?.length === 2, `courses 2건 (실제: ${courses?.length})`);

  const mapped = courses.map(mapCourseFromDb);
  const piano = mapped.find(c => c.name === '피아노 초급반');
  assert(!!piano, `피아노 초급반 존재`);
  assert(piano?.instructorName === '김선생', `강사명 김선생 (camelCase 변환 확인)`);
  assert(piano?.fee === 150000, `수강료 150000`);

  const { data: students, error: sErr } = await supabase.from('students').select('*');
  assert(!sErr, `students select 성공`);
  assert(students?.length === 3, `students 3건 (실제: ${students?.length})`);

  const mappedStudents = students.map(mapStudentFromDb);
  const sujin = mappedStudents.find(s => s.name === '이수진');
  assert(sujin?.email === 'sujin@test.com', `이수진 이메일 확인`);
  assert(sujin?.birthDate === '2000-05-15', `이수진 생년월일 camelCase 변환`);

  const { data: enrollments, error: eErr } = await supabase.from('enrollments').select('*');
  assert(!eErr, `enrollments select 성공`);
  assert(enrollments?.length === 3, `enrollments 3건 (실제: ${enrollments?.length})`);

  const mappedEnrollments = enrollments.map(mapEnrollmentFromDb);
  const completedEnroll = mappedEnrollments.find(e => e.paymentStatus === 'completed');
  assert(completedEnroll?.paidAmount === 150000, `완납 등록 납부금액 150000`);
  assert(completedEnroll?.paymentMethod === 'card', `결제방법 card`);

  const { data: payments, error: pErr } = await supabase.from('monthly_payments').select('*');
  assert(!pErr, `monthly_payments select 성공`);
  assert(payments?.length === 3, `monthly_payments 3건 (실제: ${payments?.length})`);

  const mappedPayments = payments.map(mapMonthlyPaymentFromDb);
  const paidPayment = mappedPayments.find(p => p.status === 'paid' && p.month === '2025-01');
  assert(paidPayment?.amount === 150000, `1월 납부 금액 150000`);

  // RLS 확인: organization_id 필터 없이 select해도 RLS가 자동 필터링
  console.log('\n  📋 RLS 검증 (organization_id 자동 필터링)');
  assert(
    courses.every(c => c.organization_id === testOrgId),
    `모든 courses가 현재 org에 속함`
  );
  assert(
    students.every(s => s.organization_id === testOrgId),
    `모든 students가 현재 org에 속함`
  );
  assert(
    payments.every(p => p.organization_id === testOrgId),
    `모든 monthly_payments가 현재 org에 속함 (RLS 수정 확인)`
  );
}

// ─── 테스트 4: Pre-migration cleanup + 재마이그레이션 (멱등성) ─
async function test04_preMigrationCleanupAndRemigrate() {
  console.log('\n🧪 테스트 4: Pre-migration cleanup + 재마이그레이션 (멱등성)');

  // 1. cleanup: FK 역순으로 delete
  const tables = ['monthly_payments', 'enrollments', 'students', 'courses'];
  for (const table of tables) {
    const { error } = await supabase.from(table).delete().eq('organization_id', testOrgId);
    assert(!error, `cleanup ${table} — ${error?.message || 'OK'}`);
  }

  // 2. 빈 상태 확인
  const { data: empty } = await supabase.from('courses').select('id');
  assert(empty?.length === 0, `cleanup 후 courses 0건`);

  // 3. 재마이그레이션
  const { courses, students, enrollments, monthlyPayments } = createMockData();
  const courseIdMap = new Map();
  const studentIdMap = new Map();
  const enrollmentIdMap = new Map();

  const courseRows = courses.map(c => {
    const newId = crypto.randomUUID();
    courseIdMap.set(c.id, newId);
    return mapCourseToDb({ ...c, id: newId }, testOrgId);
  });
  await supabase.from('courses').insert(courseRows);

  const studentRows = students.map(s => {
    const newId = crypto.randomUUID();
    studentIdMap.set(s.id, newId);
    return mapStudentToDb({ ...s, id: newId }, testOrgId);
  });
  await supabase.from('students').insert(studentRows);

  const enrollRows = enrollments.map(e => {
    const newId = crypto.randomUUID();
    enrollmentIdMap.set(e.id, newId);
    return mapEnrollmentToDb({
      ...e, id: newId,
      courseId: courseIdMap.get(e.courseId) || e.courseId,
      studentId: studentIdMap.get(e.studentId) || e.studentId,
    }, testOrgId);
  });
  await supabase.from('enrollments').insert(enrollRows);

  const paymentRows = monthlyPayments.map(mp => {
    const newId = crypto.randomUUID();
    return mapMonthlyPaymentToDb({
      ...mp, id: newId,
      enrollmentId: enrollmentIdMap.get(mp.enrollmentId) || mp.enrollmentId,
    }, testOrgId);
  });
  await supabase.from('monthly_payments').insert(paymentRows);

  // 4. 재마이그레이션 후 데이터 확인
  const { data: c2 } = await supabase.from('courses').select('id');
  const { data: s2 } = await supabase.from('students').select('id');
  const { data: e2 } = await supabase.from('enrollments').select('id');
  const { data: p2 } = await supabase.from('monthly_payments').select('id');
  assert(c2?.length === 2, `재마이그레이션 후 courses 2건 (중복 없음)`);
  assert(s2?.length === 3, `재마이그레이션 후 students 3건`);
  assert(e2?.length === 3, `재마이그레이션 후 enrollments 3건`);
  assert(p2?.length === 3, `재마이그레이션 후 monthly_payments 3건`);
}

// ─── 테스트 5: 백업 데이터 흐름 시뮬레이션 (Supabase → camelCase → Supabase) ─
async function test05_backupRestoreSimulation() {
  console.log('\n🧪 테스트 5: 백업/복원 시뮬레이션 (DB → camelCase → DB)');

  // 1. DB에서 읽기 (supabaseLoadData 시뮬레이션)
  const { data: courseRows } = await supabase.from('courses').select('*');
  const { data: studentRows } = await supabase.from('students').select('*');
  const { data: enrollmentRows } = await supabase.from('enrollments').select('*');
  const { data: paymentRows } = await supabase.from('monthly_payments').select('*');

  // 2. fromDb 매퍼로 camelCase 변환 (dumpSupabaseToLocal 시뮬레이션)
  const localCourses = courseRows.map(mapCourseFromDb);
  const localStudents = studentRows.map(mapStudentFromDb);
  const localEnrollments = enrollmentRows.map(mapEnrollmentFromDb);
  const localPayments = paymentRows.map(mapMonthlyPaymentFromDb);

  assert(localCourses[0].instructorName !== undefined, `camelCase 변환: instructorName 존재`);
  assert(localStudents[0].createdAt !== undefined, `camelCase 변환: createdAt 존재`);

  // 3. JSON 직렬화 (파일 저장 시뮬레이션)
  const backupJson = {
    courses: JSON.parse(JSON.stringify(localCourses)),
    students: JSON.parse(JSON.stringify(localStudents)),
    enrollments: JSON.parse(JSON.stringify(localEnrollments)),
    monthlyPayments: JSON.parse(JSON.stringify(localPayments)),
  };

  // 4. cleanup (복원 전 기존 데이터 삭제)
  await cleanupOrg(testOrgId);

  const { data: afterClean } = await supabase.from('courses').select('id');
  assert(afterClean?.length === 0, `복원 전 cleanup 완료`);

  // 5. 복원: camelCase → toDb → insert (migrateLocalToCloud 시뮬레이션)
  const courseIdMap = new Map();
  const studentIdMap = new Map();
  const enrollmentIdMap = new Map();

  const newCourseRows = backupJson.courses.map(c => {
    const newId = crypto.randomUUID();
    courseIdMap.set(c.id, newId);
    return mapCourseToDb({ ...c, id: newId }, testOrgId);
  });
  const { error: cErr } = await supabase.from('courses').insert(newCourseRows);
  assert(!cErr, `복원 courses insert — ${cErr?.message || 'OK'}`);

  const newStudentRows = backupJson.students.map(s => {
    const newId = crypto.randomUUID();
    studentIdMap.set(s.id, newId);
    return mapStudentToDb({ ...s, id: newId }, testOrgId);
  });
  const { error: sErr } = await supabase.from('students').insert(newStudentRows);
  assert(!sErr, `복원 students insert — ${sErr?.message || 'OK'}`);

  const newEnrollRows = backupJson.enrollments.map(e => {
    const newId = crypto.randomUUID();
    enrollmentIdMap.set(e.id, newId);
    return mapEnrollmentToDb({
      ...e, id: newId,
      courseId: courseIdMap.get(e.courseId) || e.courseId,
      studentId: studentIdMap.get(e.studentId) || e.studentId,
    }, testOrgId);
  });
  const { error: eErr } = await supabase.from('enrollments').insert(newEnrollRows);
  assert(!eErr, `복원 enrollments insert — ${eErr?.message || 'OK'}`);

  const newPaymentRows = backupJson.monthlyPayments.map(mp => {
    const newId = crypto.randomUUID();
    return mapMonthlyPaymentToDb({
      ...mp, id: newId,
      enrollmentId: enrollmentIdMap.get(mp.enrollmentId) || mp.enrollmentId,
    }, testOrgId);
  });
  const { error: pErr } = await supabase.from('monthly_payments').insert(newPaymentRows);
  assert(!pErr, `복원 monthly_payments insert — ${pErr?.message || 'OK'}`);

  // 6. 복원 후 검증
  const { data: finalCourses } = await supabase.from('courses').select('*');
  const { data: finalStudents } = await supabase.from('students').select('*');
  const { data: finalEnroll } = await supabase.from('enrollments').select('*');
  const { data: finalPayments } = await supabase.from('monthly_payments').select('*');

  assert(finalCourses?.length === 2, `복원 후 courses 2건`);
  assert(finalStudents?.length === 3, `복원 후 students 3건`);
  assert(finalEnroll?.length === 3, `복원 후 enrollments 3건`);
  assert(finalPayments?.length === 3, `복원 후 monthly_payments 3건`);

  // 데이터 무결성
  const restoredPiano = finalCourses.map(mapCourseFromDb).find(c => c.name === '피아노 초급반');
  assert(restoredPiano?.instructorName === '김선생', `복원 후 데이터 무결성: 강사명 김선생`);
  assert(restoredPiano?.fee === 150000, `복원 후 데이터 무결성: 수강료 150000`);
}

// ─── 테스트 6: 기존 디바이스 재접속 (create-trial-org 중복 호출) ─
async function test06_duplicateTrialOrgCall() {
  console.log('\n🧪 테스트 6: create-trial-org 중복 호출 (기존 디바이스 재접속)');

  const deviceId = crypto.randomUUID().replace(/-/g, '');

  // 첫 번째 호출
  const { data: first } = await supabase.functions.invoke('create-trial-org', {
    body: { device_id: deviceId },
  });
  assert(first?.is_new_org === true, `첫 호출: is_new_org = true`);

  // 두 번째 호출 (같은 device_id)
  const { data: second } = await supabase.functions.invoke('create-trial-org', {
    body: { device_id: deviceId },
  });
  assert(second?.is_new_org === false, `재호출: is_new_org = false`);
  assert(second?.organization_id === first?.organization_id, `같은 organization_id 반환`);

  // 정리: 두 번째로 생성된 org 데이터 cleanup
  if (second?.organization_id && second.organization_id !== testOrgId) {
    await cleanupOrg(second.organization_id);
  }
}

// ─── 정리 ────────────────────────────────────────────────────
async function cleanup() {
  console.log('\n🧹 테스트 데이터 정리 중...');

  if (testOrgId) {
    await cleanupOrg(testOrgId);

    // user_organizations, organizations 정리는 Edge Function이 생성한 것이므로
    // RLS 때문에 직접 삭제가 안 될 수 있음 — 그냥 둠
    console.log(`   org ${testOrgId} 데이터 정리 완료 (org/user_org 레코드는 유지)`);
  }

  await supabase.auth.signOut();
  console.log('   세션 종료');
}

// ─── 실행 ────────────────────────────────────────────────────
async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log(' 마이그레이션 + 백업/복원 통합 테스트');
  console.log('═══════════════════════════════════════════════');

  try {
    await test01_anonLoginAndTrialOrg();
    await test02_migrateLocalToCloud();
    await test03_verifyDbData();
    await test04_preMigrationCleanupAndRemigrate();
    await test05_backupRestoreSimulation();
    await test06_duplicateTrialOrgCall();
  } catch (err) {
    console.error('\n💥 테스트 중 예외 발생:', err);
    failed++;
  } finally {
    await cleanup();
  }

  console.log('\n═══════════════════════════════════════════════');
  console.log(` 결과: ✅ ${passed} passed / ❌ ${failed} failed`);
  console.log('═══════════════════════════════════════════════');

  process.exit(failed > 0 ? 1 : 0);
}

main();
