import React, { useState, useMemo, useCallback } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  type ColumnDef,
  type SortingState,
  flexRender,
} from '@tanstack/react-table';
import { Calendar as CalendarIcon } from 'lucide-react';
import type { PaymentMethod, Enrollment, Student, MonthlyPayment } from '@tutomate/core';
import { useMonthlyPaymentStore } from '@tutomate/core';
import { useEnrollmentStore } from '@tutomate/core';
import { useStudentStore } from '@tutomate/core';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Calendar } from '../ui/calendar';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../ui/alert-dialog';

interface MonthlyPaymentTableProps {
  courseId: string;
  courseFee: number;
  enrollments: Enrollment[];
  /** 분기 시스템: 표시할 월 목록 (YYYY-MM 형식). 없으면 +-6개월 표시 */
  quarterMonths?: string[];
  /** 강좌 생성일 (이 날짜 이전 월은 선택 불가) */
  courseCreatedAt?: string;
}

type MonthlyDataRow = {
  key: string;
  enrollment: Enrollment;
  student: Student | undefined;
  monthPayment: MonthlyPayment | undefined;
  studentName: string;
};

const MonthlyPaymentTable: React.FC<MonthlyPaymentTableProps> = ({
  courseId: _courseId,
  courseFee,
  enrollments,
  quarterMonths,
  courseCreatedAt,
}) => {
  const { getStudentById } = useStudentStore();
  const { payments, addPayment, updatePayment } = useMonthlyPaymentStore();
  const { updatePayment: updateEnrollmentPayment } = useEnrollmentStore();

  const [selectedMonth, setSelectedMonth] = useState<string>(
    quarterMonths?.[0] ?? dayjs().format('YYYY-MM'),
  );
  const [sorting, setSorting] = useState<SortingState>([]);

  // 해당 강좌의 수강생별 월별 납부 현황
  const monthlyData = useMemo(() => {
    return enrollments.map((enrollment) => {
      const student = getStudentById(enrollment.studentId);
      const enrollmentPayments = payments.filter(
        (p) => p.enrollmentId === enrollment.id && p.month === selectedMonth,
      );
      const monthPayment = enrollmentPayments[0]; // 월당 하나의 레코드

      return {
        key: enrollment.id,
        enrollment,
        student,
        monthPayment,
        studentName: student?.name || '-',
      };
    });
  }, [enrollments, payments, selectedMonth, getStudentById]);

  // 월별 통계
  const monthStats = useMemo(() => {
    const nonExempt = enrollments.filter((e) => e.paymentStatus !== 'exempt');
    const nonExemptIds = new Set(nonExempt.map((e) => e.id));
    const monthPayments = payments.filter((p) => p.month === selectedMonth);
    // 면제 수강생의 납부 기록은 통계에서 제외
    const coursePayments = monthPayments.filter((p) => nonExemptIds.has(p.enrollmentId));
    const paidCount = coursePayments.filter((p) => p.status === 'paid').length;
    const totalPaid = coursePayments.reduce((sum, p) => sum + p.amount, 0);
    const expectedTotal = nonExempt.reduce((sum, e) => sum + (courseFee - (e.discountAmount ?? 0)), 0);

    return { paidCount, totalPaid, expectedTotal, totalStudents: enrollments.length };
  }, [payments, selectedMonth, enrollments, courseFee]);

  // 특정 수강생의 월별 납부 기록
  const handleRecordPayment = useCallback(async (
    enrollment: Enrollment,
    amount: number,
    paymentMethod?: PaymentMethod,
    paidAt?: string,
  ) => {
    const existing = payments.find(
      (p) => p.enrollmentId === enrollment.id && p.month === selectedMonth,
    );

    if (existing) {
      await updatePayment(existing.id, {
        amount,
        status: amount > 0 ? 'paid' : 'pending',
        paymentMethod,
        paidAt: paidAt || (amount > 0 ? dayjs().format('YYYY-MM-DD') : undefined),
      });
    } else {
      await addPayment(enrollment.id, selectedMonth, amount, paymentMethod, paidAt);
    }

    // 수강생의 전체 월별 납부 합산 -> enrollment paidAmount 업데이트
    const allPayments = payments.filter((p) => p.enrollmentId === enrollment.id);
    const otherMonthsTotal = allPayments
      .filter((p) => p.month !== selectedMonth)
      .reduce((sum, p) => sum + p.amount, 0);
    const newTotalPaid = otherMonthsTotal + amount;

    await updateEnrollmentPayment(
      enrollment.id,
      newTotalPaid,
      courseFee,
      paidAt || dayjs().format('YYYY-MM-DD'),
      false,
      paymentMethod,
      enrollment.discountAmount,
    );

    toast.success('납부 기록이 업데이트되었습니다.');
  }, [payments, selectedMonth, addPayment, updatePayment, updateEnrollmentPayment, courseFee]);

  // 전체 완납 처리
  const handleBulkPaid = useCallback(async () => {
    const unpaid = monthlyData.filter(
      (d) => d.enrollment.paymentStatus !== 'exempt' && (!d.monthPayment || d.monthPayment.status === 'pending'),
    );

    for (const item of unpaid) {
      const effectiveFee = courseFee - (item.enrollment.discountAmount ?? 0);
      await handleRecordPayment(item.enrollment, effectiveFee);
    }

    toast.success(`${unpaid.length}명의 납부가 처리되었습니다.`);
  }, [monthlyData, handleRecordPayment, courseFee]);

  const columns = useMemo<ColumnDef<MonthlyDataRow>[]>(() => [
    {
      accessorKey: 'studentName',
      header: '이름',
      size: 120,
      sortingFn: 'alphanumeric',
    },
    {
      id: 'status',
      header: '상태',
      size: 80,
      cell: ({ row }) => {
        const record = row.original;
        if (record.enrollment.paymentStatus === 'exempt') {
          return <Badge className="bg-purple-500 text-white hover:bg-purple-500/80">면제</Badge>;
        }
        if (!record.monthPayment || record.monthPayment.status === 'pending') {
          return <Badge variant="destructive">미납</Badge>;
        }
        return <Badge className="bg-green-600 text-white hover:bg-green-600/80">납부</Badge>;
      },
    },
    {
      id: 'amount',
      header: '납부 금액',
      size: 150,
      cell: ({ row }) => {
        const record = row.original;
        if (record.enrollment.paymentStatus === 'exempt') return '-';
        return (
          <AmountInput
            value={record.monthPayment?.amount ?? 0}
            onCommit={(val) => {
              if (val !== (record.monthPayment?.amount ?? 0)) {
                handleRecordPayment(record.enrollment, val, record.monthPayment?.paymentMethod);
              }
            }}
          />
        );
      },
    },
    {
      id: 'paymentMethod',
      header: '납부 방법',
      size: 120,
      cell: ({ row }) => {
        const record = row.original;
        if (record.enrollment.paymentStatus === 'exempt') return '-';
        return (
          <Select
            value={record.monthPayment?.paymentMethod || ''}
            onValueChange={(value) => {
              handleRecordPayment(
                record.enrollment,
                record.monthPayment?.amount ?? 0,
                value as PaymentMethod,
                record.monthPayment?.paidAt,
              );
            }}
          >
            <SelectTrigger className="h-8 w-[100px] text-xs">
              <SelectValue placeholder="선택" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="transfer">계좌이체</SelectItem>
              <SelectItem value="card">카드</SelectItem>
              <SelectItem value="cash">현금</SelectItem>
            </SelectContent>
          </Select>
        );
      },
    },
    {
      id: 'paidAt',
      header: '납부일',
      size: 130,
      cell: ({ row }) => {
        const record = row.original;
        if (record.enrollment.paymentStatus === 'exempt') return '-';
        const selectedDate = record.monthPayment?.paidAt
          ? new Date(record.monthPayment.paidAt)
          : undefined;
        return (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  'h-8 w-[120px] justify-start text-left text-xs font-normal',
                  !selectedDate && 'text-muted-foreground',
                )}
              >
                <CalendarIcon className="mr-1 h-3 w-3" />
                {selectedDate
                  ? dayjs(selectedDate).format('YYYY-MM-DD')
                  : '납부일'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(date) => {
                  if (date) {
                    handleRecordPayment(
                      record.enrollment,
                      record.monthPayment?.amount ?? courseFee,
                      record.monthPayment?.paymentMethod,
                      dayjs(date).format('YYYY-MM-DD'),
                    );
                  }
                }}
              />
            </PopoverContent>
          </Popover>
        );
      },
    },
    {
      id: 'discount',
      header: '할인',
      size: 100,
      sortingFn: (rowA, rowB) =>
        (rowA.original.enrollment.discountAmount ?? 0) -
        (rowB.original.enrollment.discountAmount ?? 0),
      cell: ({ row }) => {
        const record = row.original;
        if (record.enrollment.paymentStatus === 'exempt') return '-';
        const discount = record.enrollment.discountAmount ?? 0;
        if (discount === 0) return '-';
        return (
          <span className="text-success text-[13px]">
            -{'\u20A9'}{discount.toLocaleString()}
          </span>
        );
      },
    },
    {
      id: 'notes',
      header: '메모',
      size: 150,
      cell: ({ row }) => {
        const record = row.original;
        if (record.enrollment.paymentStatus === 'exempt') return '-';
        return (
          <Input
            className="h-8 w-[140px] text-xs"
            defaultValue={record.monthPayment?.notes ?? ''}
            placeholder="메모"
            onBlur={(e) => {
              const val = e.target.value;
              if (val !== (record.monthPayment?.notes ?? '')) {
                if (record.monthPayment) {
                  updatePayment(record.monthPayment.id, { notes: val || undefined });
                } else if (val) {
                  // 레코드가 없으면 새로 생성하면서 메모 추가
                  addPayment(record.enrollment.id, selectedMonth, 0, undefined, undefined, val);
                }
              }
            }}
          />
        );
      },
    },
    {
      id: 'quick',
      header: '',
      size: 80,
      cell: ({ row }) => {
        const record = row.original;
        if (record.enrollment.paymentStatus === 'exempt') return null;
        if (record.monthPayment?.status === 'paid') return null;
        const effectiveFee = courseFee - (record.enrollment.discountAmount ?? 0);
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs border-primary text-primary hover:bg-primary hover:text-primary-foreground"
                  onClick={() => handleRecordPayment(record.enrollment, effectiveFee)}
                >
                  완납
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {'\u20A9'}{effectiveFee.toLocaleString()} 완납 처리
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      },
    },
  ], [handleRecordPayment, courseFee, updatePayment, addPayment, selectedMonth]);

  const table = useReactTable({
    data: monthlyData,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => row.key,
  });

  // 월 이동
  const months = useMemo(() => {
    if (quarterMonths && quarterMonths.length > 0) {
      return quarterMonths;
    }
    const minMonth = courseCreatedAt ? dayjs(courseCreatedAt).format('YYYY-MM') : null;
    const result: string[] = [];
    for (let i = -6; i <= 6; i++) {
      const m = dayjs().add(i, 'month').format('YYYY-MM');
      if (minMonth && m < minMonth) continue;
      result.push(m);
    }
    return result;
  }, [quarterMonths, courseCreatedAt]);

  return (
    <div>
      {/* 월 선택 + 액션 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <CalendarIcon className="h-4 w-4 text-muted-foreground" />
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {months.map((m) => (
                <SelectItem key={m} value={m}>
                  {dayjs(m + '-01').format('YYYY년 M월')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!quarterMonths && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedMonth(dayjs().format('YYYY-MM'))}
            >
              이번 달
            </Button>
          )}
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button>전체 완납</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>전체 완납 처리</AlertDialogTitle>
              <AlertDialogDescription>
                미납 상태인 모든 수강생을 완납 처리하시겠습니까?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>취소</AlertDialogCancel>
              <AlertDialogAction onClick={handleBulkPaid}>확인</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* 월별 통계 */}
      <div className="mb-4 p-3 bg-muted/50 rounded-lg flex gap-6">
        <div>
          <span className="text-xs text-muted-foreground">납부 인원</span>
          <div className="font-semibold">
            <span className="text-success">{monthStats.paidCount}</span>
            <span className="text-muted-foreground"> / {monthStats.totalStudents}명</span>
          </div>
        </div>
        <div>
          <span className="text-xs text-muted-foreground">납부 합계</span>
          <div className="font-semibold text-success">
            {'\u20A9'}{monthStats.totalPaid.toLocaleString()}
          </div>
        </div>
        <div>
          <span className="text-xs text-muted-foreground">예상 합계</span>
          <div className="font-semibold">
            {'\u20A9'}{monthStats.expectedTotal.toLocaleString()}
          </div>
        </div>
        <div>
          <span className="text-xs text-muted-foreground">수납률</span>
          <div className={cn(
            'font-semibold',
            monthStats.expectedTotal > 0 && monthStats.totalPaid < monthStats.expectedTotal
              ? 'text-destructive'
              : 'text-success',
          )}>
            {monthStats.expectedTotal > 0 ? Math.round((monthStats.totalPaid / monthStats.expectedTotal) * 100) : 0}%
          </div>
        </div>
      </div>

      {/* 테이블 */}
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
                  style={{ width: header.getSize() }}
                  className={header.column.getCanSort() ? 'cursor-pointer select-none' : ''}
                  onClick={header.column.getToggleSortingHandler()}
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                  {header.column.getIsSorted() === 'asc' ? ' \u2191' : ''}
                  {header.column.getIsSorted() === 'desc' ? ' \u2193' : ''}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length > 0 ? (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id} style={{ width: cell.column.getSize() }}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                수강생이 없습니다
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
};

/** 금액 입력 컴포넌트 (포맷팅 + blur/enter 커밋) */
function AmountInput({
  value,
  onCommit,
}: {
  value: number;
  onCommit: (val: number) => void;
}) {
  const [localValue, setLocalValue] = useState(String(value));

  // 외부 value가 바뀌면 동기화
  React.useEffect(() => {
    setLocalValue(String(value));
  }, [value]);

  const commit = () => {
    const parsed = parseInt(localValue.replace(/[^0-9]/g, ''), 10) || 0;
    onCommit(parsed);
  };

  return (
    <Input
      type="text"
      className="h-8 w-[130px] text-xs"
      value={`\u20A9 ${Number(localValue.replace(/[^0-9]/g, '') || '0').toLocaleString()}`}
      onChange={(e) => {
        const raw = e.target.value.replace(/[^0-9]/g, '');
        setLocalValue(raw);
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          commit();
        }
      }}
    />
  );
}

export default MonthlyPaymentTable;
