// llm-lab은 Supabase 없이도 도구 호출 평가가 가능해야 함.
// 본 앱과 동일한 도구 시그니처를 메모리 데이터로 제공.

import { z } from 'zod';
import { ALL_TOOLS, type ToolHandler } from '@tutomate/core';
import {
  attendance,
  courses,
  enrollments,
  monthlyPayments,
  paymentRecords,
  students,
  THIS_MONTH,
} from './mockData.ts';

// ─── 본 앱의 임포트 도구 3개 — Supabase 미호출 ─────────────
const importToolNames = ['parseExcelHeaders', 'mapColumns', 'previewImport'];
const importTools = ALL_TOOLS.filter((t) => importToolNames.includes(t.name));

// ─── 조회 도구 — mockData 기반 ──────────────────────────────

const searchStudent: ToolHandler<any> = {
  name: 'searchStudent',
  description: '이름 또는 전화번호 부분 일치로 수강생 검색 (동명이인 다건 반환)',
  schema: z.object({
    name: z.string().optional(),
    phone: z.string().optional(),
  }).refine((v) => v.name || v.phone, { message: 'name 또는 phone 중 하나는 필수' }),
  async execute(args: { name?: string; phone?: string }) {
    return {
      students: students
        .filter((s) => {
          if (args.name && !s.name.includes(args.name)) return false;
          if (args.phone && !s.phone.includes(args.phone.replace(/\D+/g, ''))) return false;
          return true;
        })
        .map((s) => ({ id: s.id, name: s.name, phone: s.phone, status: s.status, is_member: s.is_member })),
    };
  },
};

const getStudent: ToolHandler<any> = {
  name: 'getStudent',
  description: '특정 수강생의 상세 정보',
  schema: z.object({ studentId: z.string() }),
  async execute({ studentId }: { studentId: string }) {
    const s = students.find((x) => x.id === studentId);
    if (!s) return { error: { code: 'not_found', message: '수강생을 찾을 수 없습니다.' } };
    return { student: s };
  },
};

const getPaymentHistory: ToolHandler<any> = {
  name: 'getPaymentHistory',
  description: '수강생의 결제 이력 (최근부터 정렬)',
  schema: z.object({
    studentId: z.string(),
    period: z.enum(['month', 'quarter', 'year']).optional(),
    limit: z.number().int().min(1).max(100).optional().default(20),
  }),
  async execute({ studentId, period, limit }: { studentId: string; period?: string; limit?: number }) {
    let list = paymentRecords.filter((p) => p.student_id === studentId);
    if (period) {
      const monthsAgo = period === 'month' ? 1 : period === 'quarter' ? 3 : 12;
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - monthsAgo);
      const cutoffStr = cutoff.toISOString().slice(0, 10);
      list = list.filter((p) => p.paid_at >= cutoffStr);
    }
    return {
      payments: list
        .sort((a, b) => b.paid_at.localeCompare(a.paid_at))
        .slice(0, limit ?? 20)
        .map((p) => {
          const course = courses.find((c) => c.id === p.course_id);
          return { ...p, course_name: course?.name };
        }),
    };
  },
};

const getUnpaidStudents: ToolHandler<any> = {
  name: 'getUnpaidStudents',
  description: '특정 월(미지정 시 이번 달)의 미납자 목록',
  schema: z.object({ month: z.string().regex(/^\d{4}-\d{2}$/).optional() }),
  async execute({ month }: { month?: string }) {
    const target = month ?? THIS_MONTH;
    const unpaid = monthlyPayments
      .filter((mp) => mp.month === target && (mp.status === 'pending' || mp.status === 'partial'))
      .map((mp) => {
        const s = students.find((x) => x.id === mp.student_id);
        const c = courses.find((x) => x.id === mp.course_id);
        return {
          student_id: mp.student_id,
          student_name: s?.name,
          phone: s?.phone,
          parent_phone: s?.parent_phone,
          course: c?.name,
          status: mp.status,
          expected_amount: mp.expected_amount,
          paid_amount: mp.paid_amount,
          unpaid_amount: mp.expected_amount - mp.paid_amount,
        };
      });
    return { month: target, count: unpaid.length, unpaid };
  },
};

const getAttendance: ToolHandler<any> = {
  name: 'getAttendance',
  description: '수강생의 출석 기록 (period: YYYY-MM 지정 시 해당 월만)',
  schema: z.object({
    studentId: z.string(),
    period: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  }),
  async execute({ studentId, period }: { studentId: string; period?: string }) {
    let list = attendance.filter((a) => a.student_id === studentId);
    if (period) list = list.filter((a) => a.session_date.startsWith(period));
    list.sort((a, b) => b.session_date.localeCompare(a.session_date));
    const summary = {
      present: list.filter((a) => a.status === 'present').length,
      absent: list.filter((a) => a.status === 'absent').length,
      late: list.filter((a) => a.status === 'late').length,
      total: list.length,
    };
    return { attendance: list, summary };
  },
};

const getEnrollment: ToolHandler<any> = {
  name: 'getEnrollment',
  description: '수강생의 강좌 등록 정보',
  schema: z.object({ studentId: z.string() }),
  async execute({ studentId }: { studentId: string }) {
    return {
      enrollments: enrollments
        .filter((e) => e.student_id === studentId)
        .map((e) => ({
          ...e,
          course: courses.find((c) => c.id === e.course_id),
        })),
    };
  },
};

const listClasses: ToolHandler<any> = {
  name: 'listClasses',
  description: '강좌 목록. studentId 지정 시 해당 수강생이 등록한 강좌만.',
  schema: z.object({ studentId: z.string().optional() }),
  async execute({ studentId }: { studentId?: string }) {
    if (studentId) {
      const enrolled = enrollments.filter((e) => e.student_id === studentId);
      return {
        classes: enrolled
          .map((e) => courses.find((c) => c.id === e.course_id))
          .filter(Boolean),
      };
    }
    return { classes: courses };
  },
};

const getClassRoster: ToolHandler<any> = {
  name: 'getClassRoster',
  description: '특정 강좌의 활성 수강생 명단',
  schema: z.object({ classId: z.string() }),
  async execute({ classId }: { classId: string }) {
    const roster = enrollments
      .filter((e) => e.course_id === classId && e.status === 'active')
      .map((e) => students.find((s) => s.id === e.student_id))
      .filter(Boolean);
    return {
      class_id: classId,
      class_name: courses.find((c) => c.id === classId)?.name,
      roster: roster.map((s) => ({ id: s!.id, name: s!.name, phone: s!.phone })),
      count: roster.length,
    };
  },
};

const getMonthlySummary: ToolHandler<any> = {
  name: 'getMonthlySummary',
  description: '해당 월의 매출/등록 요약 통계',
  schema: z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) }),
  async execute({ month }: { month: string }) {
    const monthPayments = paymentRecords.filter((p) => p.paid_at.startsWith(month));
    const totalAmount = monthPayments.reduce((s, p) => s + p.amount, 0);
    const newEnrollments = enrollments.filter((e) => e.started_at.startsWith(month)).length;
    const monthMP = monthlyPayments.filter((mp) => mp.month === month);
    return {
      month,
      totalAmount,
      paymentCount: monthPayments.length,
      newEnrollments,
      unpaidCount: monthMP.filter((mp) => mp.status === 'pending').length,
      partialCount: monthMP.filter((mp) => mp.status === 'partial').length,
      completedCount: monthMP.filter((mp) => mp.status === 'completed').length,
      byMethod: {
        cash: monthPayments.filter((p) => p.payment_method === 'cash').length,
        card: monthPayments.filter((p) => p.payment_method === 'card').length,
        transfer: monthPayments.filter((p) => p.payment_method === 'transfer').length,
      },
    };
  },
};

const getStudentSummary: ToolHandler<any> = {
  name: 'getStudentSummary',
  description: '수강생 종합 요약 (등록 강좌, 최근 결제, 출석 통계)',
  schema: z.object({ studentId: z.string() }),
  async execute({ studentId }: { studentId: string }) {
    const student = students.find((s) => s.id === studentId);
    if (!student) return { error: { code: 'not_found', message: '수강생을 찾을 수 없습니다.' } };
    const enr = enrollments
      .filter((e) => e.student_id === studentId)
      .map((e) => ({ ...e, course: courses.find((c) => c.id === e.course_id) }));
    const recentPayments = paymentRecords
      .filter((p) => p.student_id === studentId)
      .sort((a, b) => b.paid_at.localeCompare(a.paid_at))
      .slice(0, 5);
    const att = attendance.filter((a) => a.student_id === studentId);
    return {
      student,
      enrollments: enr,
      recentPayments,
      attendanceSummary: {
        present: att.filter((a) => a.status === 'present').length,
        absent: att.filter((a) => a.status === 'absent').length,
        late: att.filter((a) => a.status === 'late').length,
        total: att.length,
      },
    };
  },
};

export const MOCK_TOOLS: ToolHandler<any>[] = [
  searchStudent,
  getStudent,
  getPaymentHistory,
  getUnpaidStudents,
  getAttendance,
  getEnrollment,
  listClasses,
  getClassRoster,
  getMonthlySummary,
  getStudentSummary,
  ...importTools,
];
