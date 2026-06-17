// 풍부한 시나리오 평가용 메모리 데이터셋.
// - 학생 12명 (재원 + 휴원 + 회원/비회원, 동명이인 포함)
// - 강좌 5개 (수학/영어/논술/피아노/미술)
// - 등록 다대다 (학생 1인이 여러 강좌 가능)
// - 결제: 다중 월, 카드/계좌/현금, 미납·완납·부분납·면제·포기
// - 출석: 최근 1개월치 기록
//
// 시점: '오늘' = 2026-05-07. 5월 결제는 일부만, 4월 이전은 대부분 완납.

export const TODAY = '2026-05-07';
export const THIS_MONTH = '2026-05';

export interface Student {
  id: string;
  name: string;
  phone: string;
  parent_phone?: string;
  birth_date?: string;
  enrollment_date: string;
  status: 'active' | 'paused' | 'withdrawn';
  is_member: boolean;
  org_id: string;
}

export interface Course {
  id: string;
  name: string;
  instructor_name: string;
  fee: number; // 월 수강료
  org_id: string;
}

export interface Enrollment {
  id: string;
  student_id: string;
  course_id: string;
  status: 'active' | 'paused' | 'completed' | 'withdrawn';
  started_at: string;
  ended_at?: string;
  org_id: string;
}

export interface PaymentRecord {
  id: string;
  student_id: string;
  course_id: string;
  paid_at: string;
  amount: number;
  payment_method: 'cash' | 'card' | 'transfer';
  notes?: string;
  org_id: string;
}

export interface MonthlyPayment {
  id: string;
  student_id: string;
  course_id: string;
  month: string; // YYYY-MM
  status: 'pending' | 'partial' | 'completed' | 'exempt' | 'withdrawn';
  expected_amount: number;
  paid_amount: number;
  org_id: string;
}

export interface AttendanceRecord {
  id: string;
  student_id: string;
  course_id: string;
  session_date: string;
  status: 'present' | 'absent' | 'late';
  org_id: string;
}

// ─── Courses ─────────────────────────────────────────────
export const courses: Course[] = [
  { id: 'c-math',    name: '수학반',     instructor_name: '박선생', fee: 180_000, org_id: 'lab' },
  { id: 'c-english', name: '영어회화반', instructor_name: '이선생', fee: 200_000, org_id: 'lab' },
  { id: 'c-essay',   name: '논술반',     instructor_name: '김선생', fee: 150_000, org_id: 'lab' },
  { id: 'c-piano',   name: '피아노반',   instructor_name: '윤선생', fee: 220_000, org_id: 'lab' },
  { id: 'c-art',     name: '미술반',     instructor_name: '최선생', fee: 160_000, org_id: 'lab' },
];

// ─── Students ────────────────────────────────────────────
export const students: Student[] = [
  { id: 's1',  name: '김민준', phone: '01012345678', parent_phone: '01087650001', birth_date: '2010-03-15', enrollment_date: '2024-09-01', status: 'active', is_member: true, org_id: 'lab' },
  { id: 's2',  name: '이서연', phone: '01087654321', parent_phone: '01087650002', birth_date: '2011-07-22', enrollment_date: '2024-10-15', status: 'active', is_member: true, org_id: 'lab' },
  { id: 's3',  name: '박지민', phone: '01055556666', parent_phone: '01087650003', birth_date: '2009-12-05', enrollment_date: '2025-01-10', status: 'active', is_member: false, org_id: 'lab' },
  { id: 's4',  name: '최우진', phone: '01044443333', parent_phone: '01087650004', birth_date: '2012-04-18', enrollment_date: '2025-03-02', status: 'active', is_member: true, org_id: 'lab' },
  { id: 's5',  name: '정하윤', phone: '01077778888', parent_phone: '01087650005', birth_date: '2010-11-30', enrollment_date: '2024-08-20', status: 'paused', is_member: true, org_id: 'lab' },
  { id: 's6',  name: '강지호', phone: '01099991111', parent_phone: '01087650006', birth_date: '2013-02-14', enrollment_date: '2025-04-05', status: 'active', is_member: false, org_id: 'lab' },
  { id: 's7',  name: '윤서아', phone: '01022223333', parent_phone: '01087650007', birth_date: '2011-06-10', enrollment_date: '2024-11-12', status: 'active', is_member: true, org_id: 'lab' },
  { id: 's8',  name: '임도윤', phone: '01066667777', parent_phone: '01087650008', birth_date: '2010-09-08', enrollment_date: '2024-07-01', status: 'active', is_member: true, org_id: 'lab' },
  { id: 's9',  name: '한예린', phone: '01033334444', parent_phone: '01087650009', birth_date: '2012-01-25', enrollment_date: '2025-02-18', status: 'active', is_member: true, org_id: 'lab' },
  // 동명이인
  { id: 's10', name: '김민준', phone: '01098765432', parent_phone: '01087650010', birth_date: '2008-05-03', enrollment_date: '2024-06-15', status: 'withdrawn', is_member: false, org_id: 'lab' },
  // 회원 아닌 단기 수강
  { id: 's11', name: '오시우', phone: '01011112222', enrollment_date: '2025-04-20', status: 'active', is_member: false, org_id: 'lab' },
  { id: 's12', name: '신유나', phone: '01044445555', parent_phone: '01087650012', birth_date: '2013-08-19', enrollment_date: '2025-05-01', status: 'active', is_member: false, org_id: 'lab' },
];

// ─── Enrollments ─────────────────────────────────────────
export const enrollments: Enrollment[] = [
  // 김민준(s1) — 수학 + 영어
  { id: 'e1',  student_id: 's1',  course_id: 'c-math',    status: 'active', started_at: '2024-09-01', org_id: 'lab' },
  { id: 'e2',  student_id: 's1',  course_id: 'c-english', status: 'active', started_at: '2025-01-05', org_id: 'lab' },
  // 이서연(s2) — 논술
  { id: 'e3',  student_id: 's2',  course_id: 'c-essay',   status: 'active', started_at: '2024-10-15', org_id: 'lab' },
  // 박지민(s3) — 수학 + 미술
  { id: 'e4',  student_id: 's3',  course_id: 'c-math',    status: 'active', started_at: '2025-01-10', org_id: 'lab' },
  { id: 'e5',  student_id: 's3',  course_id: 'c-art',     status: 'active', started_at: '2025-02-01', org_id: 'lab' },
  // 최우진(s4) — 피아노
  { id: 'e6',  student_id: 's4',  course_id: 'c-piano',   status: 'active', started_at: '2025-03-02', org_id: 'lab' },
  // 정하윤(s5) — 수학 (휴원)
  { id: 'e7',  student_id: 's5',  course_id: 'c-math',    status: 'paused', started_at: '2024-08-20', ended_at: '2025-04-30', org_id: 'lab' },
  // 강지호(s6) — 영어
  { id: 'e8',  student_id: 's6',  course_id: 'c-english', status: 'active', started_at: '2025-04-05', org_id: 'lab' },
  // 윤서아(s7) — 영어 + 미술
  { id: 'e9',  student_id: 's7',  course_id: 'c-english', status: 'active', started_at: '2024-11-12', org_id: 'lab' },
  { id: 'e10', student_id: 's7',  course_id: 'c-art',     status: 'active', started_at: '2025-01-15', org_id: 'lab' },
  // 임도윤(s8) — 수학 + 논술 + 영어 (다중 등록)
  { id: 'e11', student_id: 's8',  course_id: 'c-math',    status: 'active', started_at: '2024-07-01', org_id: 'lab' },
  { id: 'e12', student_id: 's8',  course_id: 'c-essay',   status: 'active', started_at: '2024-09-01', org_id: 'lab' },
  { id: 'e13', student_id: 's8',  course_id: 'c-english', status: 'active', started_at: '2025-02-01', org_id: 'lab' },
  // 한예린(s9) — 피아노
  { id: 'e14', student_id: 's9',  course_id: 'c-piano',   status: 'active', started_at: '2025-02-18', org_id: 'lab' },
  // 김민준(s10, 동명이인) — 영어 (포기)
  { id: 'e15', student_id: 's10', course_id: 'c-english', status: 'withdrawn', started_at: '2024-06-15', ended_at: '2025-02-28', org_id: 'lab' },
  // 오시우(s11) — 미술 (단기)
  { id: 'e16', student_id: 's11', course_id: 'c-art',     status: 'active', started_at: '2025-04-20', org_id: 'lab' },
  // 신유나(s12) — 피아노 (이번 달 등록)
  { id: 'e17', student_id: 's12', course_id: 'c-piano',   status: 'active', started_at: '2025-05-01', org_id: 'lab' },
];

// ─── Payment records (개별 결제 거래) ────────────────────
// 시나리오: 2025-01 ~ 2026-05까지 17개월. 각 학생 active 등록에 대해 매월 결제 (일부 누락).
export const paymentRecords: PaymentRecord[] = [
  // 김민준(s1) — 수학+영어, 거의 매월 카드 결제
  ...['2025-01','2025-02','2025-03','2025-04'].flatMap((m) => [
    { id: `pr-s1-math-${m}`,    student_id: 's1', course_id: 'c-math',    paid_at: `${m}-15`, amount: 180_000, payment_method: 'card' as const, org_id: 'lab' },
    { id: `pr-s1-english-${m}`, student_id: 's1', course_id: 'c-english', paid_at: `${m}-15`, amount: 200_000, payment_method: 'card' as const, org_id: 'lab' },
  ]),
  // 5월: 수학만 결제, 영어 미납
  { id: 'pr-s1-math-2026-05', student_id: 's1', course_id: 'c-math', paid_at: '2026-05-05', amount: 180_000, payment_method: 'card', org_id: 'lab' },

  // 이서연(s2) — 논술, 계좌이체
  ...['2025-02','2025-03','2025-04'].map((m) => (
    { id: `pr-s2-essay-${m}`, student_id: 's2', course_id: 'c-essay', paid_at: `${m}-01`, amount: 150_000, payment_method: 'transfer' as const, org_id: 'lab' }
  )),
  { id: 'pr-s2-essay-2026-05', student_id: 's2', course_id: 'c-essay', paid_at: '2026-05-02', amount: 150_000, payment_method: 'transfer', org_id: 'lab' },

  // 박지민(s3) — 수학+미술
  ...['2025-02','2025-03','2025-04'].flatMap((m) => [
    { id: `pr-s3-math-${m}`, student_id: 's3', course_id: 'c-math', paid_at: `${m}-10`, amount: 180_000, payment_method: 'cash' as const, org_id: 'lab' },
    { id: `pr-s3-art-${m}`,  student_id: 's3', course_id: 'c-art',  paid_at: `${m}-10`, amount: 160_000, payment_method: 'cash' as const, org_id: 'lab' },
  ]),
  // 5월 미납 (s3는 이번 달 둘 다 미납자 — 시나리오 핵심)

  // 최우진(s4) — 피아노, 매월 25일 카드
  ...['2025-04','2026-05'].map((m) => (
    { id: `pr-s4-piano-${m}`, student_id: 's4', course_id: 'c-piano', paid_at: `${m}-25`, amount: 220_000, payment_method: 'card' as const, org_id: 'lab' }
  )),
  // 부분납 시나리오: 3월에 절반만
  { id: 'pr-s4-piano-2025-03-partial', student_id: 's4', course_id: 'c-piano', paid_at: '2025-03-25', amount: 110_000, payment_method: 'card', notes: '부분납', org_id: 'lab' },

  // 정하윤(s5) — 휴원 전 마지막 결제
  { id: 'pr-s5-math-2025-04', student_id: 's5', course_id: 'c-math', paid_at: '2025-04-15', amount: 180_000, payment_method: 'transfer', org_id: 'lab' },

  // 강지호(s6) — 영어, 4월부터
  { id: 'pr-s6-english-2025-04', student_id: 's6', course_id: 'c-english', paid_at: '2025-04-10', amount: 200_000, payment_method: 'transfer', org_id: 'lab' },
  // 5월 미납

  // 윤서아(s7) — 영어+미술, 매월 정상
  ...['2025-02','2025-03','2025-04','2026-05'].flatMap((m) => [
    { id: `pr-s7-english-${m}`, student_id: 's7', course_id: 'c-english', paid_at: `${m}-12`, amount: 200_000, payment_method: 'card' as const, org_id: 'lab' },
    { id: `pr-s7-art-${m}`,     student_id: 's7', course_id: 'c-art',     paid_at: `${m}-12`, amount: 160_000, payment_method: 'card' as const, org_id: 'lab' },
  ]),

  // 임도윤(s8) — 3개 강좌 모두, 매월 1일 계좌
  ...['2025-01','2025-02','2025-03','2025-04','2026-05'].flatMap((m) => [
    { id: `pr-s8-math-${m}`,    student_id: 's8', course_id: 'c-math',    paid_at: `${m}-01`, amount: 180_000, payment_method: 'transfer' as const, org_id: 'lab' },
    { id: `pr-s8-essay-${m}`,   student_id: 's8', course_id: 'c-essay',   paid_at: `${m}-01`, amount: 150_000, payment_method: 'transfer' as const, org_id: 'lab' },
    { id: `pr-s8-english-${m}`, student_id: 's8', course_id: 'c-english', paid_at: `${m}-01`, amount: 200_000, payment_method: 'transfer' as const, org_id: 'lab' },
  ]),

  // 한예린(s9) — 피아노
  ...['2025-03','2025-04','2026-05'].map((m) => (
    { id: `pr-s9-piano-${m}`, student_id: 's9', course_id: 'c-piano', paid_at: `${m}-18`, amount: 220_000, payment_method: 'card' as const, org_id: 'lab' }
  )),

  // 오시우(s11) — 미술, 4월 1회만 (단기)
  { id: 'pr-s11-art-2025-04', student_id: 's11', course_id: 'c-art', paid_at: '2025-04-22', amount: 160_000, payment_method: 'cash', org_id: 'lab' },

  // 신유나(s12) — 5월 등록비만, 결제 면제 시나리오는 monthly_payments에서
];

// ─── Monthly payment 상태 (월 단위 매핑) ─────────────────
// 위 paymentRecords를 보고 산출. 일부는 수동으로 명시.
export const monthlyPayments: MonthlyPayment[] = [
  // 5월 — 본 시나리오 미납자/완납자 시연
  { id: 'mp-s1-math-2026-05',      student_id: 's1',  course_id: 'c-math',    month: '2026-05', status: 'completed', expected_amount: 180_000, paid_amount: 180_000, org_id: 'lab' },
  { id: 'mp-s1-english-2026-05',   student_id: 's1',  course_id: 'c-english', month: '2026-05', status: 'pending',   expected_amount: 200_000, paid_amount: 0,       org_id: 'lab' },
  { id: 'mp-s2-essay-2026-05',     student_id: 's2',  course_id: 'c-essay',   month: '2026-05', status: 'completed', expected_amount: 150_000, paid_amount: 150_000, org_id: 'lab' },
  { id: 'mp-s3-math-2026-05',      student_id: 's3',  course_id: 'c-math',    month: '2026-05', status: 'pending',   expected_amount: 180_000, paid_amount: 0,       org_id: 'lab' },
  { id: 'mp-s3-art-2026-05',       student_id: 's3',  course_id: 'c-art',     month: '2026-05', status: 'pending',   expected_amount: 160_000, paid_amount: 0,       org_id: 'lab' },
  { id: 'mp-s4-piano-2026-05',     student_id: 's4',  course_id: 'c-piano',   month: '2026-05', status: 'completed', expected_amount: 220_000, paid_amount: 220_000, org_id: 'lab' },
  { id: 'mp-s6-english-2026-05',   student_id: 's6',  course_id: 'c-english', month: '2026-05', status: 'pending',   expected_amount: 200_000, paid_amount: 0,       org_id: 'lab' },
  { id: 'mp-s7-english-2026-05',   student_id: 's7',  course_id: 'c-english', month: '2026-05', status: 'completed', expected_amount: 200_000, paid_amount: 200_000, org_id: 'lab' },
  { id: 'mp-s7-art-2026-05',       student_id: 's7',  course_id: 'c-art',     month: '2026-05', status: 'completed', expected_amount: 160_000, paid_amount: 160_000, org_id: 'lab' },
  { id: 'mp-s8-math-2026-05',      student_id: 's8',  course_id: 'c-math',    month: '2026-05', status: 'completed', expected_amount: 180_000, paid_amount: 180_000, org_id: 'lab' },
  { id: 'mp-s8-essay-2026-05',     student_id: 's8',  course_id: 'c-essay',   month: '2026-05', status: 'completed', expected_amount: 150_000, paid_amount: 150_000, org_id: 'lab' },
  { id: 'mp-s8-english-2026-05',   student_id: 's8',  course_id: 'c-english', month: '2026-05', status: 'completed', expected_amount: 200_000, paid_amount: 200_000, org_id: 'lab' },
  { id: 'mp-s9-piano-2026-05',     student_id: 's9',  course_id: 'c-piano',   month: '2026-05', status: 'completed', expected_amount: 220_000, paid_amount: 220_000, org_id: 'lab' },
  { id: 'mp-s12-piano-2026-05',    student_id: 's12', course_id: 'c-piano',   month: '2026-05', status: 'exempt',    expected_amount: 220_000, paid_amount: 0, org_id: 'lab' }, // 면제

  // 4월 — 박지민 부분납, 정하윤 휴원 직전 완납
  { id: 'mp-s4-piano-2025-03', student_id: 's4', course_id: 'c-piano', month: '2025-03', status: 'partial',   expected_amount: 220_000, paid_amount: 110_000, org_id: 'lab' },
];

// ─── Attendance (최근 30일치, 일부 학생만) ─────────────────
function genAttendance(studentId: string, courseId: string, days: { date: string; status: 'present' | 'absent' | 'late' }[]): AttendanceRecord[] {
  return days.map((d, i) => ({
    id: `att-${studentId}-${courseId}-${i}`,
    student_id: studentId,
    course_id: courseId,
    session_date: d.date,
    status: d.status,
    org_id: 'lab',
  }));
}

export const attendance: AttendanceRecord[] = [
  // 김민준(s1) 수학반 — 거의 출석
  ...genAttendance('s1', 'c-math', [
    { date: '2026-04-10', status: 'present' },
    { date: '2026-04-12', status: 'present' },
    { date: '2026-04-17', status: 'late' },
    { date: '2026-04-19', status: 'present' },
    { date: '2026-04-24', status: 'present' },
    { date: '2026-04-26', status: 'absent' },
    { date: '2026-05-01', status: 'present' },
    { date: '2026-05-03', status: 'present' },
  ]),
  // 박지민(s3) 수학반 — 결석 잦음
  ...genAttendance('s3', 'c-math', [
    { date: '2026-04-10', status: 'present' },
    { date: '2026-04-12', status: 'absent' },
    { date: '2026-04-17', status: 'absent' },
    { date: '2026-04-19', status: 'present' },
    { date: '2026-04-24', status: 'late' },
    { date: '2026-04-26', status: 'absent' },
    { date: '2026-05-01', status: 'absent' },
    { date: '2026-05-03', status: 'present' },
  ]),
  // 임도윤(s8) 영어반 — 모범 출석
  ...genAttendance('s8', 'c-english', [
    { date: '2026-04-11', status: 'present' },
    { date: '2026-04-13', status: 'present' },
    { date: '2026-04-18', status: 'present' },
    { date: '2026-04-20', status: 'present' },
    { date: '2026-04-25', status: 'present' },
    { date: '2026-04-27', status: 'present' },
    { date: '2026-05-02', status: 'present' },
    { date: '2026-05-04', status: 'present' },
  ]),
];
