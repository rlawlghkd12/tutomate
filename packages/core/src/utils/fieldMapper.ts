import type { Course, Student, Enrollment, MonthlyPayment, CourseSchedule } from '../types';

// ─── Course ────────────────────────────────────────────────────────

export interface CourseRow {
  id: string;
  organization_id: string;
  name: string;
  classroom: string;
  instructor_name: string;
  instructor_phone: string;
  fee: number;
  max_students: number;
  current_students: number;
  schedule: CourseSchedule | null;
  created_at: string;
  updated_at: string;
}

export function mapCourseFromDb(row: CourseRow): Course {
  return {
    id: row.id,
    name: row.name,
    classroom: row.classroom,
    instructorName: row.instructor_name,
    instructorPhone: row.instructor_phone,
    fee: row.fee,
    maxStudents: row.max_students,
    currentStudents: row.current_students,
    schedule: row.schedule ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapCourseToDb(
  course: Omit<Course, 'createdAt' | 'updatedAt'>,
  orgId: string,
): Omit<CourseRow, 'created_at' | 'updated_at'> {
  return {
    id: course.id,
    organization_id: orgId,
    name: course.name,
    classroom: course.classroom,
    instructor_name: course.instructorName,
    instructor_phone: course.instructorPhone,
    fee: course.fee,
    max_students: course.maxStudents,
    current_students: course.currentStudents,
    schedule: course.schedule ?? null,
  };
}

export function mapCourseUpdateToDb(
  updates: Partial<Course>,
): Record<string, unknown> {
  const mapped: Record<string, unknown> = {};
  if (updates.name !== undefined) mapped.name = updates.name;
  if (updates.classroom !== undefined) mapped.classroom = updates.classroom;
  if (updates.instructorName !== undefined) mapped.instructor_name = updates.instructorName;
  if (updates.instructorPhone !== undefined) mapped.instructor_phone = updates.instructorPhone;
  if (updates.fee !== undefined) mapped.fee = updates.fee;
  if (updates.maxStudents !== undefined) mapped.max_students = updates.maxStudents;
  if (updates.currentStudents !== undefined) mapped.current_students = updates.currentStudents;
  if (updates.schedule !== undefined) mapped.schedule = updates.schedule;
  return mapped;
}

// ─── Student ───────────────────────────────────────────────────────

export interface StudentRow {
  id: string;
  organization_id: string;
  name: string;
  phone: string;
  email: string | null;
  address: string | null;
  birth_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export function mapStudentFromDb(row: StudentRow): Student {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email ?? undefined,
    address: row.address ?? undefined,
    birthDate: row.birth_date ?? undefined,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapStudentToDb(
  student: Omit<Student, 'createdAt' | 'updatedAt'>,
  orgId: string,
): Omit<StudentRow, 'created_at' | 'updated_at'> {
  return {
    id: student.id,
    organization_id: orgId,
    name: student.name,
    phone: student.phone,
    email: student.email ?? null,
    address: student.address ?? null,
    birth_date: student.birthDate ?? null,
    notes: student.notes ?? null,
  };
}

export function mapStudentUpdateToDb(
  updates: Partial<Student>,
): Record<string, unknown> {
  const mapped: Record<string, unknown> = {};
  if (updates.name !== undefined) mapped.name = updates.name;
  if (updates.phone !== undefined) mapped.phone = updates.phone;
  if (updates.email !== undefined) mapped.email = updates.email;
  if (updates.address !== undefined) mapped.address = updates.address;
  if (updates.birthDate !== undefined) mapped.birth_date = updates.birthDate;
  if (updates.notes !== undefined) mapped.notes = updates.notes;
  return mapped;
}

// ─── Enrollment ────────────────────────────────────────────────────

export interface EnrollmentRow {
  id: string;
  organization_id: string;
  course_id: string;
  student_id: string;
  enrolled_at: string;
  payment_status: string;
  paid_amount: number;
  remaining_amount: number;
  paid_at: string | null;
  payment_method: string | null;
  discount_amount: number;
  notes: string | null;
  created_at: string;
}

export function mapEnrollmentFromDb(row: EnrollmentRow): Enrollment {
  return {
    id: row.id,
    courseId: row.course_id,
    studentId: row.student_id,
    enrolledAt: row.enrolled_at,
    paymentStatus: row.payment_status as Enrollment['paymentStatus'],
    paidAmount: row.paid_amount,
    remainingAmount: row.remaining_amount,
    paidAt: row.paid_at ?? undefined,
    paymentMethod: (row.payment_method as Enrollment['paymentMethod']) ?? undefined,
    discountAmount: row.discount_amount ?? 0,
    notes: row.notes ?? undefined,
  };
}

export function mapEnrollmentToDb(
  enrollment: Enrollment,
  orgId: string,
): EnrollmentRow {
  return {
    id: enrollment.id,
    organization_id: orgId,
    course_id: enrollment.courseId,
    student_id: enrollment.studentId,
    enrolled_at: enrollment.enrolledAt,
    payment_status: enrollment.paymentStatus,
    paid_amount: enrollment.paidAmount,
    remaining_amount: enrollment.remainingAmount,
    paid_at: enrollment.paidAt ?? null,
    payment_method: enrollment.paymentMethod ?? null,
    discount_amount: enrollment.discountAmount ?? 0,
    notes: enrollment.notes ?? null,
    created_at: enrollment.enrolledAt,
  };
}

export function mapEnrollmentUpdateToDb(
  updates: Partial<Enrollment>,
): Record<string, unknown> {
  const mapped: Record<string, unknown> = {};
  if (updates.courseId !== undefined) mapped.course_id = updates.courseId;
  if (updates.studentId !== undefined) mapped.student_id = updates.studentId;
  if (updates.paymentStatus !== undefined) mapped.payment_status = updates.paymentStatus;
  if (updates.paidAmount !== undefined) mapped.paid_amount = updates.paidAmount;
  if (updates.remainingAmount !== undefined) mapped.remaining_amount = updates.remainingAmount;
  if (updates.paidAt !== undefined) mapped.paid_at = updates.paidAt;
  if (updates.paymentMethod !== undefined) mapped.payment_method = updates.paymentMethod;
  if (updates.discountAmount !== undefined) mapped.discount_amount = updates.discountAmount;
  if (updates.notes !== undefined) mapped.notes = updates.notes;
  return mapped;
}

// ─── MonthlyPayment ─────────────────────────────────────────────

export interface MonthlyPaymentRow {
  id: string;
  organization_id: string;
  enrollment_id: string;
  month: string;
  amount: number;
  paid_at: string | null;
  payment_method: string | null;
  status: string;
  notes: string | null;
  created_at: string;
}

export function mapMonthlyPaymentFromDb(row: MonthlyPaymentRow): MonthlyPayment {
  return {
    id: row.id,
    enrollmentId: row.enrollment_id,
    month: row.month,
    amount: row.amount,
    paidAt: row.paid_at ?? undefined,
    paymentMethod: (row.payment_method as MonthlyPayment['paymentMethod']) ?? undefined,
    status: row.status as MonthlyPayment['status'],
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
  };
}

export function mapMonthlyPaymentToDb(
  payment: MonthlyPayment,
  orgId: string,
): MonthlyPaymentRow {
  return {
    id: payment.id,
    organization_id: orgId,
    enrollment_id: payment.enrollmentId,
    month: payment.month,
    amount: payment.amount,
    paid_at: payment.paidAt ?? null,
    payment_method: payment.paymentMethod ?? null,
    status: payment.status,
    notes: payment.notes ?? null,
    created_at: payment.createdAt,
  };
}

export function mapMonthlyPaymentUpdateToDb(
  updates: Partial<MonthlyPayment>,
): Record<string, unknown> {
  const mapped: Record<string, unknown> = {};
  if (updates.amount !== undefined) mapped.amount = updates.amount;
  if (updates.paidAt !== undefined) mapped.paid_at = updates.paidAt;
  if (updates.paymentMethod !== undefined) mapped.payment_method = updates.paymentMethod;
  if (updates.status !== undefined) mapped.status = updates.status;
  if (updates.notes !== undefined) mapped.notes = updates.notes;
  return mapped;
}
