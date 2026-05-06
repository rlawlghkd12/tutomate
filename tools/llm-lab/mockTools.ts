// llm-lab은 Supabase 없이도 도구 호출 평가가 가능해야 함.
// 메모리 데이터로 동일한 도구 시그니처 제공.

import { z } from 'zod';
import { ALL_TOOLS, type ToolHandler } from '@tutomate/core';

// 본 앱의 임포트 도구 3개만 사용 (confirmImport는 Supabase 호출이라 제외)
const importToolNames = ['parseExcelHeaders', 'mapColumns', 'previewImport'];
const importTools = ALL_TOOLS.filter((t) => importToolNames.includes(t.name));

// 메모리 DB
const mockStudents = [
  { id: 's1', name: '김민준', phone: '01012345678', org_id: 'lab' },
  { id: 's2', name: '이서연', phone: '01087654321', org_id: 'lab' },
  { id: 's3', name: '박지민', phone: '01055556666', org_id: 'lab' },
];
const mockPayments = [
  { id: 'p1', student_id: 's1', paid_at: '2025-04-15', amount: 50000, payment_method: 'card' },
  { id: 'p2', student_id: 's1', paid_at: '2025-03-15', amount: 50000, payment_method: 'card' },
  { id: 'p3', student_id: 's2', paid_at: '2025-04-01', amount: 80000, payment_method: 'transfer' },
];

const searchStudent: ToolHandler<any> = {
  name: 'searchStudent',
  description: '이름 또는 전화번호 부분 일치로 수강생 검색',
  schema: z.object({
    name: z.string().optional(),
    phone: z.string().optional(),
  }),
  async execute(args: { name?: string; phone?: string }) {
    return {
      students: mockStudents.filter((s) => {
        if (args.name && !s.name.includes(args.name)) return false;
        if (args.phone && !s.phone.includes(args.phone.replace(/\D+/g, ''))) return false;
        return true;
      }),
    };
  },
};

const getPaymentHistory: ToolHandler<any> = {
  name: 'getPaymentHistory',
  description: '수강생의 결제 이력',
  schema: z.object({
    studentId: z.string(),
    limit: z.number().optional().default(20),
  }),
  async execute({ studentId }: { studentId: string }) {
    return {
      payments: mockPayments
        .filter((p) => p.student_id === studentId)
        .sort((a, b) => b.paid_at.localeCompare(a.paid_at)),
    };
  },
};

const getUnpaidStudents: ToolHandler<any> = {
  name: 'getUnpaidStudents',
  description: '특정 월의 미납자 목록',
  schema: z.object({
    month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  }),
  async execute({ month }: { month?: string }) {
    const target = month ?? '2025-05';
    return {
      month: target,
      unpaid: [{ student_id: 's3', name: '박지민', status: 'pending' }],
    };
  },
};

const getMonthlySummary: ToolHandler<any> = {
  name: 'getMonthlySummary',
  description: '해당 월 매출/등록 요약',
  schema: z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) }),
  async execute({ month }: { month: string }) {
    const total = mockPayments
      .filter((p) => p.paid_at.startsWith(month))
      .reduce((s, p) => s + p.amount, 0);
    return { month, totalAmount: total, paymentCount: 0, newEnrollments: 0 };
  },
};

export const MOCK_TOOLS: ToolHandler<any>[] = [
  searchStudent,
  getPaymentHistory,
  getUnpaidStudents,
  getMonthlySummary,
  // 임포트 도구는 core의 진본 사용 (Supabase 미호출 도구만)
  ...importTools,
];
