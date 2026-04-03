import { describe, it, expect } from 'vitest';
import {
  mapCourseFromDb, mapCourseToDb, mapCourseUpdateToDb,
  mapStudentFromDb, mapStudentToDb, mapStudentUpdateToDb,
  mapEnrollmentFromDb, mapEnrollmentToDb, mapEnrollmentUpdateToDb,
  mapMonthlyPaymentFromDb, mapMonthlyPaymentToDb, mapMonthlyPaymentUpdateToDb,
  type CourseRow, type StudentRow, type EnrollmentRow, type MonthlyPaymentRow,
} from '../fieldMapper';

// ─── Course ────────────────────────────────────────────────────

describe('mapCourseFromDb', () => {
  const row: CourseRow = {
    id: 'c1',
    organization_id: 'org1',
    name: '수학',
    classroom: 'A101',
    instructor_name: '김강사',
    instructor_phone: '010-1234-5678',
    fee: 300000,
    max_students: 30,
    current_students: 15,
    schedule: { startDate: '2026-03-01', daysOfWeek: [1, 3], startTime: '09:00', endTime: '10:00', totalSessions: 20, holidays: [] },
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
  };

  it('snake_case → camelCase 변환', () => {
    const course = mapCourseFromDb(row);
    expect(course.instructorName).toBe('김강사');
    expect(course.instructorPhone).toBe('010-1234-5678');
    expect(course.maxStudents).toBe(30);
    expect(course.currentStudents).toBe(15);
    expect(course.createdAt).toBe('2026-01-01T00:00:00Z');
    expect(course.updatedAt).toBe('2026-01-02T00:00:00Z');
  });

  it('schedule null → undefined', () => {
    const course = mapCourseFromDb({ ...row, schedule: null });
    expect(course.schedule).toBeUndefined();
  });

  it('schedule 있으면 그대로 전달', () => {
    const course = mapCourseFromDb(row);
    expect(course.schedule?.daysOfWeek).toEqual([1, 3]);
  });

  it('organization_id는 결과에 포함 안됨', () => {
    const course = mapCourseFromDb(row);
    expect(course).not.toHaveProperty('organization_id');
  });
});

describe('mapCourseToDb', () => {
  it('camelCase → snake_case + orgId 포함', () => {
    const result = mapCourseToDb({
      id: 'c1', name: '수학', classroom: 'A101',
      instructorName: '김강사', instructorPhone: '010-1234-5678',
      fee: 300000, maxStudents: 30, currentStudents: 15,
    }, 'org1');
    expect(result.instructor_name).toBe('김강사');
    expect(result.organization_id).toBe('org1');
    expect(result.max_students).toBe(30);
  });

  it('schedule undefined → null', () => {
    const result = mapCourseToDb({
      id: 'c1', name: '수학', classroom: 'A101',
      instructorName: '김', instructorPhone: '010',
      fee: 0, maxStudents: 0, currentStudents: 0,
    }, 'org1');
    expect(result.schedule).toBeNull();
  });
});

describe('mapCourseUpdateToDb', () => {
  it('정의된 필드만 매핑', () => {
    const result = mapCourseUpdateToDb({ name: '영어', fee: 500000 });
    expect(result).toEqual({ name: '영어', fee: 500000 });
  });

  it('빈 객체 → 빈 결과', () => {
    expect(mapCourseUpdateToDb({})).toEqual({});
  });

  it('instructorName → instructor_name', () => {
    const result = mapCourseUpdateToDb({ instructorName: '박강사' });
    expect(result).toEqual({ instructor_name: '박강사' });
  });
});

// ─── Student ───────────────────────────────────────────────────

describe('mapStudentFromDb', () => {
  const row: StudentRow = {
    id: 's1', organization_id: 'org1', name: '홍길동', phone: '010-0000-0000',
    email: 'hong@test.com', address: '서울시', birth_date: '2000-01-01',
    notes: '메모', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-02T00:00:00Z',
  };

  it('nullable 필드 값 있으면 그대로', () => {
    const student = mapStudentFromDb(row);
    expect(student.email).toBe('hong@test.com');
    expect(student.address).toBe('서울시');
    expect(student.birthDate).toBe('2000-01-01');
  });

  it('nullable 필드 null → undefined', () => {
    const student = mapStudentFromDb({ ...row, email: null, address: null, birth_date: null, notes: null });
    expect(student.email).toBeUndefined();
    expect(student.address).toBeUndefined();
    expect(student.birthDate).toBeUndefined();
    expect(student.notes).toBeUndefined();
  });
});

describe('mapStudentToDb', () => {
  it('undefined → null 변환', () => {
    const result = mapStudentToDb({ id: 's1', name: '홍', phone: '010' }, 'org1');
    expect(result.email).toBeNull();
    expect(result.address).toBeNull();
    expect(result.birth_date).toBeNull();
    expect(result.notes).toBeNull();
    expect(result.organization_id).toBe('org1');
  });
});

describe('mapStudentUpdateToDb', () => {
  it('birthDate → birth_date', () => {
    const result = mapStudentUpdateToDb({ birthDate: '2000-01-01' });
    expect(result).toEqual({ birth_date: '2000-01-01' });
  });

  it('미정의 필드 제외', () => {
    const result = mapStudentUpdateToDb({ name: '김' });
    expect(result).toEqual({ name: '김' });
    expect(result).not.toHaveProperty('phone');
  });
});

// ─── Enrollment ────────────────────────────────────────────────

describe('mapEnrollmentFromDb', () => {
  const row: EnrollmentRow = {
    id: 'e1', organization_id: 'org1', course_id: 'c1', student_id: 's1',
    enrolled_at: '2026-03-01T00:00:00Z', payment_status: 'completed',
    paid_amount: 300000, remaining_amount: 0, paid_at: '2026-03-01',
    payment_method: 'card', discount_amount: 50000, notes: '비고',
    created_at: '2026-03-01T00:00:00Z',
  };

  it('snake_case → camelCase 변환', () => {
    const enrollment = mapEnrollmentFromDb(row);
    expect(enrollment.courseId).toBe('c1');
    expect(enrollment.studentId).toBe('s1');
    expect(enrollment.paymentStatus).toBe('completed');
    expect(enrollment.paidAmount).toBe(300000);
    expect(enrollment.discountAmount).toBe(50000);
  });

  it('payment_status string → union type', () => {
    for (const status of ['pending', 'partial', 'completed', 'exempt'] as const) {
      const enrollment = mapEnrollmentFromDb({ ...row, payment_status: status });
      expect(enrollment.paymentStatus).toBe(status);
    }
  });

  it('nullable 필드 null → undefined', () => {
    const enrollment = mapEnrollmentFromDb({ ...row, paid_at: null, payment_method: null, notes: null });
    expect(enrollment.paidAt).toBeUndefined();
    expect(enrollment.paymentMethod).toBeUndefined();
    expect(enrollment.notes).toBeUndefined();
  });

  it('discount_amount null → 0 기본값', () => {
    const enrollment = mapEnrollmentFromDb({ ...row, discount_amount: null as unknown as number });
    expect(enrollment.discountAmount).toBe(0);
  });
});

describe('mapEnrollmentToDb', () => {
  it('enrolledAt → enrolled_at + created_at 동시 매핑', () => {
    const result = mapEnrollmentToDb({
      id: 'e1', courseId: 'c1', studentId: 's1', enrolledAt: '2026-03-01T00:00:00Z',
      paymentStatus: 'pending', paidAmount: 0, remainingAmount: 300000, discountAmount: 0,
    }, 'org1');
    expect(result.enrolled_at).toBe('2026-03-01T00:00:00Z');
    expect(result.created_at).toBe('2026-03-01T00:00:00Z');
    expect(result.course_id).toBe('c1');
    expect(result.student_id).toBe('s1');
  });

  it('optional 필드 undefined → null', () => {
    const result = mapEnrollmentToDb({
      id: 'e1', courseId: 'c1', studentId: 's1', enrolledAt: '2026-03-01T00:00:00Z',
      paymentStatus: 'pending', paidAmount: 0, remainingAmount: 0, discountAmount: 0,
    }, 'org1');
    expect(result.paid_at).toBeNull();
    expect(result.payment_method).toBeNull();
    expect(result.notes).toBeNull();
  });
});

describe('mapEnrollmentUpdateToDb', () => {
  it('discountAmount → discount_amount', () => {
    const result = mapEnrollmentUpdateToDb({ discountAmount: 20000 });
    expect(result).toEqual({ discount_amount: 20000 });
  });

  it('paymentMethod → payment_method', () => {
    const result = mapEnrollmentUpdateToDb({ paymentMethod: 'card' });
    expect(result).toEqual({ payment_method: 'card' });
  });

  it('여러 필드 동시 매핑', () => {
    const result = mapEnrollmentUpdateToDb({ paidAmount: 100000, remainingAmount: 200000, paymentStatus: 'partial' });
    expect(result).toEqual({ paid_amount: 100000, remaining_amount: 200000, payment_status: 'partial' });
  });
});

// ─── MonthlyPayment ────────────────────────────────────────────

describe('mapMonthlyPaymentFromDb', () => {
  const row: MonthlyPaymentRow = {
    id: 'mp1', organization_id: 'org1', enrollment_id: 'e1', month: '2026-03',
    amount: 300000, paid_at: '2026-03-15', payment_method: 'transfer',
    status: 'paid', notes: null, created_at: '2026-03-01T00:00:00Z',
  };

  it('기본 매핑', () => {
    const payment = mapMonthlyPaymentFromDb(row);
    expect(payment.enrollmentId).toBe('e1');
    expect(payment.month).toBe('2026-03');
    expect(payment.status).toBe('paid');
  });

  it('nullable payment_method null → undefined', () => {
    const payment = mapMonthlyPaymentFromDb({ ...row, payment_method: null });
    expect(payment.paymentMethod).toBeUndefined();
  });
});

describe('mapMonthlyPaymentToDb', () => {
  it('매핑 정확성', () => {
    const result = mapMonthlyPaymentToDb({
      id: 'mp1', enrollmentId: 'e1', month: '2026-03', amount: 300000,
      status: 'paid', createdAt: '2026-03-01T00:00:00Z',
    }, 'org1');
    expect(result.enrollment_id).toBe('e1');
    expect(result.organization_id).toBe('org1');
  });
});

describe('mapMonthlyPaymentUpdateToDb', () => {
  it('정의된 필드만 매핑', () => {
    const result = mapMonthlyPaymentUpdateToDb({ amount: 200000, status: 'pending' });
    expect(result).toEqual({ amount: 200000, status: 'pending' });
  });

  it('빈 객체 → 빈 결과', () => {
    expect(mapMonthlyPaymentUpdateToDb({})).toEqual({});
  });
});

// ─── 라운드트립 일관성 ───────────────────────────────────────────────────────

describe('라운드트립 일관성', () => {
  it('Course: mapCourseToDb → mapCourseFromDb 일관성', () => {
    const original = {
      id: 'c1', name: '수학', classroom: 'A101',
      instructorName: '김강사', instructorPhone: '010-1234-5678',
      fee: 300000, maxStudents: 30, currentStudents: 15,
    };
    const dbRow = mapCourseToDb(original, 'org1');
    const restored = mapCourseFromDb({ ...dbRow, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' });
    expect(restored.id).toBe(original.id);
    expect(restored.name).toBe(original.name);
    expect(restored.instructorName).toBe(original.instructorName);
    expect(restored.maxStudents).toBe(original.maxStudents);
  });

  it('Student: mapStudentToDb → mapStudentFromDb 일관성', () => {
    const original = {
      id: 's1', name: '홍길동', phone: '010-0000-0000',
      email: 'hong@test.com', address: '서울시', birthDate: '2000-01-01', notes: '메모',
    };
    const dbRow = mapStudentToDb(original, 'org1');
    const restored = mapStudentFromDb({ ...dbRow, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' });
    expect(restored.id).toBe(original.id);
    expect(restored.email).toBe(original.email);
    expect(restored.birthDate).toBe(original.birthDate);
  });

  it('Enrollment: mapEnrollmentToDb → mapEnrollmentFromDb 일관성', () => {
    const original = {
      id: 'e1', courseId: 'c1', studentId: 's1',
      enrolledAt: '2026-03-01T00:00:00Z', paymentStatus: 'partial' as const,
      paidAmount: 150000, remainingAmount: 50000, discountAmount: 0,
      paymentMethod: 'card' as const, notes: '비고',
    };
    const dbRow = mapEnrollmentToDb(original, 'org1');
    const restored = mapEnrollmentFromDb(dbRow);
    expect(restored.id).toBe(original.id);
    expect(restored.paymentStatus).toBe(original.paymentStatus);
    expect(restored.paidAmount).toBe(original.paidAmount);
    expect(restored.paymentMethod).toBe(original.paymentMethod);
    expect(restored.notes).toBe(original.notes);
  });

  it('MonthlyPayment: mapMonthlyPaymentToDb → mapMonthlyPaymentFromDb 일관성', () => {
    const original = {
      id: 'mp1', enrollmentId: 'e1', month: '2026-03',
      amount: 300000, status: 'paid' as const, createdAt: '2026-03-01T00:00:00Z',
      paidAt: '2026-03-15', paymentMethod: 'transfer' as const, notes: '노트',
    };
    const dbRow = mapMonthlyPaymentToDb(original, 'org1');
    const restored = mapMonthlyPaymentFromDb(dbRow);
    expect(restored.id).toBe(original.id);
    expect(restored.amount).toBe(original.amount);
    expect(restored.paymentMethod).toBe(original.paymentMethod);
    expect(restored.notes).toBe(original.notes);
  });
});

// ─── null 필드 매핑 기본값 ────────────────────────────────────────────────

describe('null 필드 매핑 기본값', () => {
  it('Course: schedule null → undefined (앱 타입 기본값)', () => {
    const row: import('../fieldMapper').CourseRow = {
      id: 'c1', organization_id: 'org1', name: '수학', classroom: 'A',
      instructor_name: '김', instructor_phone: '010', fee: 0,
      max_students: 10, current_students: 0, schedule: null,
      created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    };
    const course = mapCourseFromDb(row);
    expect(course.schedule).toBeUndefined();
  });

  it('Student: is_member null → isMember undefined', () => {
    const row: import('../fieldMapper').StudentRow = {
      id: 's1', organization_id: 'org1', name: '홍', phone: '010',
      email: null, address: null, birth_date: null, notes: null,
      is_member: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    };
    const student = mapStudentFromDb(row);
    expect(student.isMember).toBeUndefined();
    expect(student.email).toBeUndefined();
    expect(student.address).toBeUndefined();
    expect(student.birthDate).toBeUndefined();
  });

  it('Enrollment: quarter null → quarter undefined, enrolledMonths null → undefined', () => {
    const row: import('../fieldMapper').EnrollmentRow = {
      id: 'e1', organization_id: 'org1', course_id: 'c1', student_id: 's1',
      enrolled_at: '2026-03-01T00:00:00Z', payment_status: 'pending',
      paid_amount: 0, remaining_amount: 0, paid_at: null, payment_method: null,
      discount_amount: 0, notes: null, quarter: null, enrolled_months: null,
      created_at: '2026-03-01T00:00:00Z',
    };
    const enrollment = mapEnrollmentFromDb(row);
    expect(enrollment.quarter).toBeUndefined();
    expect(enrollment.enrolledMonths).toBeUndefined();
  });

  it('MonthlyPayment: paid_at null → paidAt undefined, notes null → undefined', () => {
    const row: import('../fieldMapper').MonthlyPaymentRow = {
      id: 'mp1', organization_id: 'org1', enrollment_id: 'e1', month: '2026-03',
      amount: 300000, paid_at: null, payment_method: null,
      status: 'pending', notes: null, created_at: '2026-03-01T00:00:00Z',
    };
    const payment = mapMonthlyPaymentFromDb(row);
    expect(payment.paidAt).toBeUndefined();
    expect(payment.paymentMethod).toBeUndefined();
    expect(payment.notes).toBeUndefined();
  });
});
