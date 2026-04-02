# Quarter Payment Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 월별 납부 시스템을 분기별 납부 이력 시스템으로 전환한다.

**Architecture:** `monthly_payments` → `payment_records` 테이블로 대체. 납부할 때마다 이력 1건 추가, enrollment에 합산 캐시. UI는 expandable 행으로 납부 이력 표시.

**Tech Stack:** React, Zustand, Ant Design, Supabase (PostgreSQL), TypeScript

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `packages/core/src/types/index.ts` | Modify | PaymentRecord 타입 추가 |
| `packages/core/src/utils/fieldMapper.ts` | Modify | PaymentRecord DB 매핑 추가 |
| `packages/core/src/stores/paymentRecordStore.ts` | Create | 납부 이력 CRUD + enrollment 합산 |
| `packages/core/src/utils/quarterUtils.ts` | Modify | 불필요 함수 제거 |
| `packages/core/src/index.ts` | Modify | export 변경 |
| `packages/ui/src/components/students/EnrollmentForm.tsx` | Modify | enrolledMonths 제거, paymentRecord 연동 |
| `packages/ui/src/components/payment/PaymentManagementTable.tsx` | Create | 분기별 납부 현황 + expandable 이력 |
| `packages/ui/src/index.ts` | Modify | export 추가 |
| `apps/tutomate/src/pages/CourseDetailPage.tsx` | Modify | 탭 이름 + 컴포넌트 교체 |
| `apps/tutomate-q/src/pages/CourseDetailPage.tsx` | Modify | 탭 이름 + 컴포넌트 교체 |

---

### Task 1: PaymentRecord 타입 및 DB 매핑 추가

**Files:**
- Modify: `packages/core/src/types/index.ts`
- Modify: `packages/core/src/utils/fieldMapper.ts`

- [ ] **Step 1: types/index.ts에 PaymentRecord 타입 추가**

`MonthlyPayment` 인터페이스 아래에 추가:

```typescript
// 납부 이력 기록
export interface PaymentRecord {
  id: string;
  enrollmentId: string;
  amount: number;
  paidAt: string; // YYYY-MM-DD
  paymentMethod?: PaymentMethod;
  notes?: string;
  createdAt: string;
}
```

- [ ] **Step 2: fieldMapper.ts에 PaymentRecord 매핑 추가**

파일 상단 import에 `PaymentRecord` 추가:
```typescript
import type { Course, Student, Enrollment, MonthlyPayment, PaymentRecord, CourseSchedule } from '../types';
```

파일 끝에 추가:
```typescript
// ─── PaymentRecord ─────────────────────────────────────────────

export interface PaymentRecordRow {
  id: string;
  organization_id: string;
  enrollment_id: string;
  amount: number;
  paid_at: string;
  payment_method: string | null;
  notes: string | null;
  created_at: string;
}

export function mapPaymentRecordFromDb(row: PaymentRecordRow): PaymentRecord {
  return {
    id: row.id,
    enrollmentId: row.enrollment_id,
    amount: row.amount,
    paidAt: row.paid_at,
    paymentMethod: (row.payment_method as PaymentRecord['paymentMethod']) ?? undefined,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
  };
}

export function mapPaymentRecordToDb(
  record: PaymentRecord,
  orgId: string,
): PaymentRecordRow {
  return {
    id: record.id,
    organization_id: orgId,
    enrollment_id: record.enrollmentId,
    amount: record.amount,
    paid_at: record.paidAt,
    payment_method: record.paymentMethod ?? null,
    notes: record.notes ?? null,
    created_at: record.createdAt,
  };
}

export function mapPaymentRecordUpdateToDb(
  updates: Partial<PaymentRecord>,
): Record<string, unknown> {
  const mapped: Record<string, unknown> = {};
  if (updates.amount !== undefined) mapped.amount = updates.amount;
  if (updates.paidAt !== undefined) mapped.paid_at = updates.paidAt;
  if (updates.paymentMethod !== undefined) mapped.payment_method = updates.paymentMethod;
  if (updates.notes !== undefined) mapped.notes = updates.notes;
  return mapped;
}
```

- [ ] **Step 3: Build 확인**

Run: `pnpm --filter @tutomate/app build 2>&1 | tail -5`
Expected: 빌드 성공

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/types/index.ts packages/core/src/utils/fieldMapper.ts
git commit -m "feat: add PaymentRecord type and DB field mapper"
```

---

### Task 2: paymentRecordStore 생성

**Files:**
- Create: `packages/core/src/stores/paymentRecordStore.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: paymentRecordStore.ts 생성**

`packages/core/src/stores/paymentRecordStore.ts`:

```typescript
import dayjs from "dayjs";
import { create } from "zustand";
import type { PaymentRecord, PaymentMethod } from "../types";
import { createDataHelper } from "../utils/dataHelper";
import type { PaymentRecordRow } from "../utils/fieldMapper";
import {
  mapPaymentRecordFromDb,
  mapPaymentRecordToDb,
  mapPaymentRecordUpdateToDb,
} from "../utils/fieldMapper";
import { useEnrollmentStore } from "./enrollmentStore";

const helper = createDataHelper<PaymentRecord, PaymentRecordRow>({
  table: "payment_records",
  fromDb: mapPaymentRecordFromDb,
  toDb: mapPaymentRecordToDb,
  updateToDb: mapPaymentRecordUpdateToDb,
});

interface PaymentRecordStore {
  records: PaymentRecord[];
  loadRecords: () => Promise<void>;
  invalidate: () => void;
  getRecordsByEnrollmentId: (enrollmentId: string) => PaymentRecord[];
  addPayment: (
    enrollmentId: string,
    amount: number,
    courseFee: number,
    paymentMethod?: PaymentMethod,
    paidAt?: string,
    notes?: string,
  ) => Promise<PaymentRecord>;
  deletePayment: (id: string, courseFee: number) => Promise<void>;
  deletePaymentsByEnrollmentId: (enrollmentId: string) => Promise<void>;
}

export const usePaymentRecordStore = create<PaymentRecordStore>(
  (set, get) => ({
    records: [],

    loadRecords: async () => {
      try {
        const records = await helper.load();
        set({ records });
      } catch {
        // 로드 실패 시 기존 데이터 유지
      }
    },

    invalidate: () => helper.invalidate(),

    getRecordsByEnrollmentId: (enrollmentId: string) => {
      return get()
        .records.filter((r) => r.enrollmentId === enrollmentId)
        .sort((a, b) => (b.paidAt || "").localeCompare(a.paidAt || ""));
    },

    addPayment: async (
      enrollmentId,
      amount,
      courseFee,
      paymentMethod?,
      paidAt?,
      notes?,
    ) => {
      const newRecord: PaymentRecord = {
        id: crypto.randomUUID(),
        enrollmentId,
        amount,
        paidAt: paidAt || dayjs().format("YYYY-MM-DD"),
        paymentMethod,
        notes,
        createdAt: dayjs().toISOString(),
      };

      try {
        await helper.add(newRecord);
      } catch {
        // 서버 저장 실패 — 로컬에만 추가
      }
      set({ records: [...get().records, newRecord] });

      // enrollment 합산 갱신
      await syncEnrollmentTotal(enrollmentId, courseFee, get().records);

      return newRecord;
    },

    deletePayment: async (id, courseFee) => {
      const record = get().records.find((r) => r.id === id);
      if (!record) return;

      const records = await helper.remove(id, get().records);
      set({ records });

      // enrollment 합산 갱신
      await syncEnrollmentTotal(record.enrollmentId, courseFee, records);
    },

    deletePaymentsByEnrollmentId: async (enrollmentId) => {
      const toDelete = get().records.filter(
        (r) => r.enrollmentId === enrollmentId,
      );
      for (const record of toDelete) {
        await helper.remove(record.id, get().records);
      }
      set({
        records: get().records.filter((r) => r.enrollmentId !== enrollmentId),
      });
    },
  }),
);

/** payment_records 합산 → enrollment paidAmount/status 갱신 */
async function syncEnrollmentTotal(
  enrollmentId: string,
  courseFee: number,
  allRecords: PaymentRecord[],
) {
  const enrollmentRecords = allRecords.filter(
    (r) => r.enrollmentId === enrollmentId,
  );
  const totalPaid = enrollmentRecords.reduce((sum, r) => sum + r.amount, 0);
  const latestRecord = enrollmentRecords.sort((a, b) =>
    (b.paidAt || "").localeCompare(a.paidAt || ""),
  )[0];

  const enrollment = useEnrollmentStore.getState().getEnrollmentById(enrollmentId);
  if (!enrollment) return;

  const discount = enrollment.discountAmount ?? 0;

  await useEnrollmentStore.getState().updatePayment(
    enrollmentId,
    totalPaid,
    courseFee,
    latestRecord?.paidAt,
    false,
    latestRecord?.paymentMethod,
    discount,
  );
}
```

- [ ] **Step 2: core/index.ts에 export 추가**

기존 `useMonthlyPaymentStore` export 아래에 추가:
```typescript
export { usePaymentRecordStore } from './stores/paymentRecordStore';
```

fieldMapper export에 추가:
```typescript
export {
  // ... 기존 export ...
  mapPaymentRecordFromDb,
  mapPaymentRecordToDb,
  mapPaymentRecordUpdateToDb,
} from './utils/fieldMapper';
export type {
  // ... 기존 export ...
  PaymentRecordRow,
} from './utils/fieldMapper';
```

- [ ] **Step 3: Build 확인**

Run: `pnpm --filter @tutomate/app build 2>&1 | tail -5`
Expected: 빌드 성공

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/stores/paymentRecordStore.ts packages/core/src/index.ts
git commit -m "feat: add paymentRecordStore with enrollment sync"
```

---

### Task 3: EnrollmentForm에서 enrolledMonths 제거 및 paymentRecord 연동

**Files:**
- Modify: `packages/ui/src/components/students/EnrollmentForm.tsx`

- [ ] **Step 1: import 변경**

기존:
```typescript
import { useMonthlyPaymentStore } from "@tutomate/core";
import {
  getCurrentQuarter,
  getQuarterMonths,
  quarterMonthToYYYYMM,
} from "@tutomate/core";
```

변경:
```typescript
import { usePaymentRecordStore } from "@tutomate/core";
import { useCourseStore } from "@tutomate/core";
import {
  getCurrentQuarter,
} from "@tutomate/core";
```

(useCourseStore는 이미 import되어 있으므로 중복 제거)

- [ ] **Step 2: store 사용 변경**

기존:
```typescript
const { addPayment } = useMonthlyPaymentStore();
```

변경:
```typescript
const { addPayment } = usePaymentRecordStore();
```

- [ ] **Step 3: enrolledMonths 관련 state 및 UI 제거**

state 제거:
```typescript
// 삭제: const [enrolledMonths, setEnrolledMonths] = useState<number[]>([]);
```

useEffect에서 제거:
```typescript
// 삭제: setEnrolledMonths(appConfig.enableQuarterSystem ? [...quarterMonths] : []);
```

상단 변수 제거:
```typescript
// 삭제: const quarterMonths = getQuarterMonths(currentQuarter);
```

handleSubmit에서 제거:
```typescript
// 삭제: setEnrolledMonths([]);
```

JSX에서 수강등록월 체크박스 블록 전체 제거 (lines 306-319).

- [ ] **Step 4: enrollmentData에서 enrolledMonths 제거**

기존:
```typescript
...(appConfig.enableQuarterSystem && {
  quarter: currentQuarter,
  enrolledMonths,
}),
```

변경:
```typescript
...(appConfig.enableQuarterSystem && {
  quarter: currentQuarter,
}),
```

- [ ] **Step 5: 납부 레코드 생성 로직 변경**

기존 월별 납부 레코드 생성 블록 전체 (lines 152-185)를 다음으로 교체:

```typescript
// 납부 이력 생성
const newEnrollment = useEnrollmentStore
  .getState()
  .enrollments.find(
    (e) => e.studentId === student.id && e.courseId === values.courseId,
  );
if (newEnrollment && paidAmount > 0) {
  await addPayment(
    newEnrollment.id,
    paidAmount,
    course.fee,
    values.paymentMethod,
    dayjs().format("YYYY-MM-DD"),
  );
}
```

- [ ] **Step 6: Build 확인**

Run: `pnpm --filter @tutomate/app build 2>&1 | tail -5`
Expected: 빌드 성공

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/components/students/EnrollmentForm.tsx
git commit -m "refactor: remove enrolledMonths from EnrollmentForm, use paymentRecordStore"
```

---

### Task 4: PaymentManagementTable 컴포넌트 생성

**Files:**
- Create: `packages/ui/src/components/payment/PaymentManagementTable.tsx`
- Modify: `packages/ui/src/index.ts`

- [ ] **Step 1: PaymentManagementTable.tsx 생성**

`packages/ui/src/components/payment/PaymentManagementTable.tsx`:

```typescript
import React, { useState, useMemo, useCallback } from 'react';
import {
  Table, Tag, Button, Space, InputNumber, DatePicker, Input, Modal, Form,
  Select, message, Row, Col, Empty, Popconfirm, theme,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DeleteOutlined } from '@ant-design/icons';
import type { PaymentMethod, Enrollment } from '@tutomate/core';
import { usePaymentRecordStore } from '@tutomate/core';
import { useEnrollmentStore } from '@tutomate/core';
import { useStudentStore } from '@tutomate/core';
import { PAYMENT_METHOD_LABELS } from '@tutomate/core';
import dayjs from 'dayjs';

const { useToken } = theme;

interface PaymentManagementTableProps {
  courseId: string;
  courseFee: number;
  enrollments: Enrollment[];
}

const PaymentManagementTable: React.FC<PaymentManagementTableProps> = ({
  courseId: _courseId,
  courseFee,
  enrollments,
}) => {
  const { token } = useToken();
  const { getStudentById } = useStudentStore();
  const { records, addPayment, deletePayment } = usePaymentRecordStore();
  const { updatePayment: updateEnrollmentPayment } = useEnrollmentStore();

  const [isPaymentModalVisible, setIsPaymentModalVisible] = useState(false);
  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState<string | null>(null);
  const [form] = Form.useForm();

  // 수강생별 납부 현황
  const tableData = useMemo(() => {
    return enrollments.map((enrollment) => {
      const student = getStudentById(enrollment.studentId);
      const enrollmentRecords = records
        .filter((r) => r.enrollmentId === enrollment.id)
        .sort((a, b) => (b.paidAt || '').localeCompare(a.paidAt || ''));
      const totalPaid = enrollmentRecords.reduce((sum, r) => sum + r.amount, 0);
      const effectiveFee = courseFee - (enrollment.discountAmount ?? 0);
      const remaining = Math.max(0, effectiveFee - totalPaid);

      return {
        key: enrollment.id,
        enrollment,
        student,
        studentName: student?.name || '-',
        totalPaid,
        effectiveFee,
        remaining,
        records: enrollmentRecords,
      };
    });
  }, [enrollments, records, getStudentById, courseFee]);

  // 통계
  const stats = useMemo(() => {
    const nonExempt = tableData.filter((d) => d.enrollment.paymentStatus !== 'exempt');
    const paidCount = nonExempt.filter((d) => d.remaining === 0).length;
    const totalPaid = nonExempt.reduce((sum, d) => sum + d.totalPaid, 0);
    const expectedTotal = nonExempt.reduce((sum, d) => sum + d.effectiveFee, 0);
    return { paidCount, totalPaid, expectedTotal, totalStudents: enrollments.length };
  }, [tableData, enrollments.length]);

  // 납부 추가
  const handleAddPayment = useCallback(async () => {
    try {
      const values = await form.validateFields();
      if (!selectedEnrollmentId) return;

      await addPayment(
        selectedEnrollmentId,
        values.amount,
        courseFee,
        values.paymentMethod,
        values.paidAt?.format('YYYY-MM-DD'),
        values.notes,
      );

      message.success('납부가 기록되었습니다.');
      form.resetFields();
      setIsPaymentModalVisible(false);
      setSelectedEnrollmentId(null);
    } catch (error) {
      console.error('Payment failed:', error);
    }
  }, [selectedEnrollmentId, form, addPayment, courseFee]);

  // 납부 삭제
  const handleDeletePayment = useCallback(async (recordId: string) => {
    await deletePayment(recordId, courseFee);
    message.success('납부 기록이 삭제되었습니다.');
  }, [deletePayment, courseFee]);

  // 면제 처리
  const handleExempt = useCallback(async (enrollment: Enrollment) => {
    await updateEnrollmentPayment(
      enrollment.id, 0, courseFee, dayjs().format('YYYY-MM-DD'), true,
    );
    message.success('수강료가 면제 처리되었습니다.');
  }, [updateEnrollmentPayment, courseFee]);

  // 면제 취소
  const handleCancelExempt = useCallback(async (enrollment: Enrollment) => {
    // 면제 취소: 기존 payment_records 합산으로 복원
    const enrollmentRecords = records.filter((r) => r.enrollmentId === enrollment.id);
    const totalPaid = enrollmentRecords.reduce((sum, r) => sum + r.amount, 0);
    await updateEnrollmentPayment(
      enrollment.id, totalPaid, courseFee, undefined, false,
      undefined, enrollment.discountAmount,
    );
    message.success('면제가 취소되었습니다.');
  }, [updateEnrollmentPayment, courseFee, records]);

  // 할인 금액 수정
  const handleDiscountChange = useCallback(async (enrollment: Enrollment, newDiscount: number) => {
    const enrollmentRecords = records.filter((r) => r.enrollmentId === enrollment.id);
    const totalPaid = enrollmentRecords.reduce((sum, r) => sum + r.amount, 0);
    await updateEnrollmentPayment(
      enrollment.id,
      totalPaid,
      courseFee,
      enrollment.paidAt,
      false,
      enrollment.paymentMethod,
      newDiscount,
    );
    message.success('할인 금액이 업데이트되었습니다.');
  }, [records, updateEnrollmentPayment, courseFee]);

  // 완납 처리
  const handleFullPayment = useCallback(async (enrollment: Enrollment) => {
    const enrollmentRecords = records.filter((r) => r.enrollmentId === enrollment.id);
    const totalPaid = enrollmentRecords.reduce((sum, r) => sum + r.amount, 0);
    const effectiveFee = courseFee - (enrollment.discountAmount ?? 0);
    const remaining = effectiveFee - totalPaid;
    if (remaining <= 0) return;

    await addPayment(
      enrollment.id,
      remaining,
      courseFee,
      undefined,
      dayjs().format('YYYY-MM-DD'),
    );
    message.success('완납 처리되었습니다.');
  }, [records, addPayment, courseFee]);

  // 전체 완납
  const handleBulkFullPayment = useCallback(async () => {
    const unpaid = tableData.filter(
      (d) => d.enrollment.paymentStatus !== 'exempt' && d.remaining > 0,
    );
    for (const item of unpaid) {
      await addPayment(
        item.enrollment.id,
        item.remaining,
        courseFee,
        undefined,
        dayjs().format('YYYY-MM-DD'),
      );
    }
    message.success(`${unpaid.length}명의 완납이 처리되었습니다.`);
  }, [tableData, addPayment, courseFee]);

  // 납부 이력 (expandable row)
  const expandedRowRender = (record: typeof tableData[0]) => {
    if (record.records.length === 0) {
      return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="납부 이력이 없습니다" />;
    }

    const historyColumns: ColumnsType<typeof record.records[0]> = [
      {
        title: '납부일',
        key: 'paidAt',
        width: 120,
        render: (_, r) => r.paidAt,
      },
      {
        title: '금액',
        key: 'amount',
        width: 120,
        render: (_, r) => `₩${r.amount.toLocaleString()}`,
      },
      {
        title: '방법',
        key: 'paymentMethod',
        width: 80,
        render: (_, r) => r.paymentMethod
          ? PAYMENT_METHOD_LABELS[r.paymentMethod as keyof typeof PAYMENT_METHOD_LABELS] || '-'
          : '-',
      },
      {
        title: '메모',
        key: 'notes',
        render: (_, r) => r.notes || '-',
      },
      {
        title: '',
        key: 'action',
        width: 40,
        render: (_, r) => (
          <Popconfirm
            title="이 납부 기록을 삭제하시겠습니까?"
            onConfirm={() => handleDeletePayment(r.id)}
            okText="삭제"
            okType="danger"
            cancelText="취소"
          >
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        ),
      },
    ];

    return (
      <Table
        columns={historyColumns}
        dataSource={record.records}
        rowKey="id"
        pagination={false}
        size="small"
        style={{ margin: 0 }}
      />
    );
  };

  // 메인 테이블 컬럼
  const columns: ColumnsType<typeof tableData[0]> = [
    {
      title: '이름',
      key: 'name',
      width: 80,
      render: (_, record) => record.studentName,
      sorter: (a, b) => a.studentName.localeCompare(b.studentName),
    },
    {
      title: '납부상태',
      key: 'status',
      width: 80,
      render: (_, record) => {
        if (record.enrollment.paymentStatus === 'exempt') return <Tag color="purple">면제</Tag>;
        if (record.remaining === 0 && record.totalPaid > 0) return <Tag color="green">완납</Tag>;
        if (record.totalPaid > 0) return <Tag color="orange">부분납부</Tag>;
        return <Tag color="red">미납</Tag>;
      },
      filters: [
        { text: '완납', value: 'completed' },
        { text: '부분납부', value: 'partial' },
        { text: '미납', value: 'pending' },
        { text: '면제', value: 'exempt' },
      ],
      onFilter: (value, record) => {
        if (value === 'exempt') return record.enrollment.paymentStatus === 'exempt';
        if (value === 'completed') return record.remaining === 0 && record.totalPaid > 0;
        if (value === 'partial') return record.totalPaid > 0 && record.remaining > 0;
        return record.totalPaid === 0 && record.enrollment.paymentStatus !== 'exempt';
      },
    },
    {
      title: '납부액/수강료',
      key: 'paid',
      width: 130,
      render: (_, record) => {
        if (record.enrollment.paymentStatus === 'exempt') return '-';
        return (
          <span style={{ whiteSpace: 'nowrap' }}>
            ₩{record.totalPaid.toLocaleString()} / ₩{record.effectiveFee.toLocaleString()}
          </span>
        );
      },
    },
    {
      title: '잔액',
      key: 'remaining',
      width: 90,
      render: (_, record) => {
        if (record.enrollment.paymentStatus === 'exempt') return '-';
        return (
          <span style={{
            whiteSpace: 'nowrap',
            color: record.remaining > 0 ? token.colorError : token.colorSuccess,
            fontWeight: 600,
          }}>
            ₩{record.remaining.toLocaleString()}
          </span>
        );
      },
      sorter: (a, b) => a.remaining - b.remaining,
    },
    {
      title: '할인',
      key: 'discount',
      width: 110,
      render: (_, record) => {
        if (record.enrollment.paymentStatus === 'exempt') return '-';
        return (
          <InputNumber
            size="small"
            style={{ width: '100%' }}
            min={0}
            max={courseFee}
            value={record.enrollment.discountAmount ?? 0}
            formatter={(value) => `₩ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
            parser={(value) => value?.replace(/₩\s?|(,*)/g, '') as unknown as number}
            onBlur={(e) => {
              const raw = e.target.value?.replace(/₩\s?|(,*)/g, '') || '0';
              const val = parseInt(raw, 10) || 0;
              if (val !== (record.enrollment.discountAmount ?? 0)) {
                handleDiscountChange(record.enrollment, val);
              }
            }}
          />
        );
      },
    },
    {
      title: '',
      key: 'actions',
      width: 140,
      render: (_, record) => {
        if (record.enrollment.paymentStatus === 'exempt') {
          return (
            <Popconfirm
              title="면제를 취소하시겠습니까?"
              onConfirm={() => handleCancelExempt(record.enrollment)}
              okText="취소하기"
              cancelText="닫기"
            >
              <Button size="small">면제 취소</Button>
            </Popconfirm>
          );
        }
        return (
          <Space size={4}>
            <Button
              size="small"
              type="primary"
              ghost
              onClick={() => {
                setSelectedEnrollmentId(record.enrollment.id);
                form.setFieldsValue({
                  amount: record.remaining > 0 ? record.remaining : undefined,
                  paidAt: dayjs(),
                });
                setIsPaymentModalVisible(true);
              }}
            >
              납부
            </Button>
            {record.remaining > 0 && (
              <Button
                size="small"
                onClick={() => handleFullPayment(record.enrollment)}
              >
                완납
              </Button>
            )}
            <Popconfirm
              title="수강료를 면제 처리하시겠습니까?"
              onConfirm={() => handleExempt(record.enrollment)}
              okText="면제"
              cancelText="취소"
            >
              <Button size="small" danger>면제</Button>
            </Popconfirm>
          </Space>
        );
      },
    },
  ];

  return (
    <div>
      {/* 액션 */}
      <Row align="middle" style={{ marginBottom: 16 }}>
        <Col flex="auto" style={{ textAlign: 'right' }}>
          <Button type="primary" onClick={handleBulkFullPayment}>
            전체 완납
          </Button>
        </Col>
      </Row>

      {/* 통계 */}
      <div style={{
        marginBottom: 16,
        padding: 12,
        backgroundColor: token.colorFillQuaternary,
        borderRadius: token.borderRadius,
        display: 'flex',
        gap: 24,
      }}>
        <div>
          <span style={{ fontSize: 12, color: token.colorTextSecondary }}>완납 인원</span>
          <div style={{ fontWeight: 600 }}>
            <span style={{ color: token.colorSuccess }}>{stats.paidCount}</span>
            <span style={{ color: token.colorTextSecondary }}> / {stats.totalStudents}명</span>
          </div>
        </div>
        <div>
          <span style={{ fontSize: 12, color: token.colorTextSecondary }}>납부 합계</span>
          <div style={{ fontWeight: 600, color: token.colorSuccess }}>₩{stats.totalPaid.toLocaleString()}</div>
        </div>
        <div>
          <span style={{ fontSize: 12, color: token.colorTextSecondary }}>예상 합계</span>
          <div style={{ fontWeight: 600 }}>₩{stats.expectedTotal.toLocaleString()}</div>
        </div>
        <div>
          <span style={{ fontSize: 12, color: token.colorTextSecondary }}>수납률</span>
          <div style={{
            fontWeight: 600,
            color: stats.expectedTotal > 0 && stats.totalPaid < stats.expectedTotal
              ? token.colorError : token.colorSuccess,
          }}>
            {stats.expectedTotal > 0 ? Math.round((stats.totalPaid / stats.expectedTotal) * 100) : 0}%
          </div>
        </div>
      </div>

      {/* 테이블 */}
      <Table
        columns={columns}
        dataSource={tableData}
        rowKey="key"
        pagination={false}
        size="small"
        expandable={{
          expandedRowRender,
          rowExpandable: (record) => record.enrollment.paymentStatus !== 'exempt',
        }}
        locale={{
          emptyText: (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="수강생이 없습니다"
            />
          ),
        }}
      />

      {/* 납부 추가 모달 */}
      <Modal
        title="납부 기록 추가"
        open={isPaymentModalVisible}
        onCancel={() => {
          setIsPaymentModalVisible(false);
          setSelectedEnrollmentId(null);
          form.resetFields();
        }}
        onOk={handleAddPayment}
        okText="납부 기록"
        cancelText="취소"
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="amount"
            label="납부 금액"
            rules={[{ required: true, message: '금액을 입력하세요' }]}
          >
            <InputNumber
              style={{ width: '100%' }}
              min={1}
              formatter={(value) => `₩ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
              parser={(value) => value?.replace(/₩\s?|(,*)/g, '') as unknown as number}
            />
          </Form.Item>
          <Form.Item
            name="paymentMethod"
            label="납부 방법"
          >
            <Select placeholder="선택">
              <Select.Option value="transfer">계좌이체</Select.Option>
              <Select.Option value="card">카드</Select.Option>
              <Select.Option value="cash">현금</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item
            name="paidAt"
            label="납부일"
            rules={[{ required: true, message: '납부일을 선택하세요' }]}
          >
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="notes" label="메모">
            <Input placeholder="메모" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default PaymentManagementTable;
```

- [ ] **Step 2: ui/index.ts에 export 추가**

기존 payment 섹션에 추가:
```typescript
export { default as PaymentManagementTable } from './components/payment/PaymentManagementTable';
```

- [ ] **Step 3: Build 확인**

Run: `pnpm --filter @tutomate/app build 2>&1 | tail -5`
Expected: 빌드 성공

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/components/payment/PaymentManagementTable.tsx packages/ui/src/index.ts
git commit -m "feat: add PaymentManagementTable with expandable payment history"
```

---

### Task 5: core/index.ts export 정리

**Files:**
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: quarterUtils export에서 불필요 함수 제거**

기존:
```typescript
export {
  getCurrentQuarter,
  getQuarterLabel,
  getQuarterMonths,
  getQuarterOptions,
  quarterMonthToYYYYMM,
} from './utils/quarterUtils';
```

변경:
```typescript
export {
  getCurrentQuarter,
  getQuarterLabel,
  getQuarterOptions,
} from './utils/quarterUtils';
```

`getQuarterMonths`와 `quarterMonthToYYYYMM`은 제거. 단, `quarterUtils.ts` 파일 자체에서는 삭제하지 않음 (하위호환).

- [ ] **Step 2: Build 확인 — 제거한 export를 사용하는 곳이 없는지 확인**

Run: `pnpm --filter @tutomate/app build 2>&1 | tail -10 && pnpm --filter @tutomate/app-q build 2>&1 | tail -10`

만약 빌드 에러가 나면 해당 파일에서 import도 제거.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/index.ts
git commit -m "refactor: remove unused quarter month utils from exports"
```

---

### Task 6: CourseDetailPage 양쪽 버전 업데이트

**Files:**
- Modify: `apps/tutomate/src/pages/CourseDetailPage.tsx`
- Modify: `apps/tutomate-q/src/pages/CourseDetailPage.tsx`

- [ ] **Step 1: 일반 버전 CourseDetailPage 수정**

import 변경:
```typescript
// 제거:
import { MonthlyPaymentTable } from "@tutomate/ui";
import { useMonthlyPaymentStore, quarterMonthToYYYYMM, getQuarterMonths } from "@tutomate/core";

// 추가:
import { PaymentManagementTable } from "@tutomate/ui";
import { usePaymentRecordStore } from "@tutomate/core";
```

store 사용 변경:
```typescript
// 기존:
const { loadPayments } = useMonthlyPaymentStore();

// 변경:
const { loadRecords } = usePaymentRecordStore();
```

useEffect에서 변경:
```typescript
// 기존: loadPayments
// 변경: loadRecords
```

탭 이름 및 컴포넌트 변경 — "월별 납부" 탭:
```typescript
{
  key: "payments",
  label: (
    <span>
      <CalendarOutlined /> 납부 관리
    </span>
  ),
  children: (
    <PaymentManagementTable
      courseId={id}
      courseFee={course.fee}
      enrollments={courseEnrollments}
    />
  ),
},
```

`MonthlyPaymentTable` 관련 props (`key`, `quarterMonths`, `courseCreatedAt`) 모두 제거.

- [ ] **Step 2: Q 버전 CourseDetailPage에 동일 변경 적용**

일반 버전과 완전히 동일한 변경.

- [ ] **Step 3: Build 확인**

Run: `pnpm --filter @tutomate/app build 2>&1 | tail -5 && pnpm --filter @tutomate/app-q build 2>&1 | tail -5`
Expected: 양쪽 빌드 성공

- [ ] **Step 4: Commit**

```bash
git add apps/tutomate/src/pages/CourseDetailPage.tsx apps/tutomate-q/src/pages/CourseDetailPage.tsx
git commit -m "feat: replace MonthlyPaymentTable with PaymentManagementTable in both versions"
```

---

### Task 7: App.tsx에서 loadRecords 호출 추가

**Files:**
- Modify: `apps/tutomate/src/App.tsx`
- Modify: `apps/tutomate-q/src/App.tsx`

앱 시작 시 payment_records 데이터를 로드해야 합니다.

- [ ] **Step 1: 양쪽 App.tsx에서 paymentRecordStore 로드 추가**

기존에 `loadPayments()`가 호출되는 위치를 찾아서 `loadRecords()`도 함께 호출:

```typescript
import { usePaymentRecordStore } from "@tutomate/core";

// 기존 loadPayments 호출 근처에:
const { loadRecords } = usePaymentRecordStore();

// useEffect 내부에 추가:
loadRecords();
```

- [ ] **Step 2: Build 확인**

Run: `pnpm --filter @tutomate/app build 2>&1 | tail -5 && pnpm --filter @tutomate/app-q build 2>&1 | tail -5`
Expected: 양쪽 빌드 성공

- [ ] **Step 3: Commit**

```bash
git add apps/tutomate/src/App.tsx apps/tutomate-q/src/App.tsx
git commit -m "feat: load payment records on app startup"
```

---

### Task 8: 최종 검증

- [ ] **Step 1: 양쪽 앱 빌드 확인**

Run: `pnpm --filter @tutomate/app build && pnpm --filter @tutomate/app-q build`
Expected: 양쪽 모두 빌드 성공, 에러 없음

- [ ] **Step 2: 사용하지 않는 import 정리**

양쪽 CourseDetailPage와 관련 파일에서 사용하지 않는 import가 있는지 확인:
Run: `pnpm --filter @tutomate/app build 2>&1 | grep -i "unused\|error"`

- [ ] **Step 3: 최종 커밋**

```bash
git add -A
git commit -m "chore: cleanup unused imports after quarter payment redesign"
```
