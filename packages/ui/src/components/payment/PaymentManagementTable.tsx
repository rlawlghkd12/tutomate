import React, { useState, useMemo, useCallback } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
} from '@tanstack/react-table';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import type { Enrollment, PaymentMethod } from '@tutomate/core';
import { usePaymentRecordStore } from '@tutomate/core';
import { useEnrollmentStore } from '@tutomate/core';
import { useStudentStore } from '@tutomate/core';
import { PAYMENT_METHOD_LABELS, PaymentMethodEnum } from '@tutomate/core';
import { getPreviousQuarter, getQuarterLabel, isActiveEnrollment } from '@tutomate/core';
import type { Student, PaymentRecord } from '@tutomate/core';
import dayjs from 'dayjs';

import { cn } from '../../lib/utils';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../ui/table';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Checkbox } from '../ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription,
} from '../ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '../ui/alert-dialog';

interface PaymentManagementTableProps {
  courseId: string;
  courseFee: number;
  enrollments: Enrollment[];
  onStudentClick?: (studentId: string) => void;
  onRemoveEnrollments?: (enrollmentIds: string[], refundAmount?: number) => void;
  showMemberColumn?: boolean;
  quarterSelector?: React.ReactNode;
  rowSelection?: {
    selectedRowKeys: React.Key[];
    onChange: (keys: React.Key[]) => void;
  };
  selectedQuarter?: string;
  allEnrollments?: Enrollment[];
  onImportFromQuarter?: (studentIds: string[], quarter: string) => Promise<void>;
}

interface TableDataRow {
  key: string;
  enrollment: Enrollment;
  student: Student | undefined;
  studentName: string;
  totalPaid: number;
  effectiveFee: number;
  remaining: number;
  records: PaymentRecord[];
}

const PaymentManagementTable: React.FC<PaymentManagementTableProps> = ({
  courseId: _courseId,
  courseFee,
  enrollments,
  onStudentClick,
  onRemoveEnrollments,
  showMemberColumn,
  quarterSelector,
  rowSelection,
  selectedQuarter,
  allEnrollments,
  onImportFromQuarter,
}) => {
  const { getStudentById } = useStudentStore();
  const { records, addPayment, deletePayment, updateRecord } = usePaymentRecordStore();
  const { updatePayment: updateEnrollmentPayment } = useEnrollmentStore();
  const [withdrawDialogOpen, setWithdrawDialogOpen] = useState(false);
  const [refundAmount, setRefundAmount] = useState(0);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importChecked, setImportChecked] = useState<Record<string, boolean>>({});

  const [isPaymentModalVisible, setIsPaymentModalVisible] = useState(false);
  const [isHistoryModalVisible, setIsHistoryModalVisible] = useState(false);
  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState<string | null>(null);
  const [modalDiscount, setModalDiscount] = useState(0);

  // Form state (replacing antd Form)
  const [formAmount, setFormAmount] = useState<number | undefined>(undefined);
  const [formPaymentMethod, setFormPaymentMethod] = useState<PaymentMethod | undefined>(undefined);
  const [formPaidAt, setFormPaidAt] = useState<string>(dayjs().format('YYYY-MM-DD'));
  const [formNotes, setFormNotes] = useState('');
  const [formDiscountAmount, setFormDiscountAmount] = useState(0);

  // TanStack Table state
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const prevQuarterData = useMemo(() => {
    if (!selectedQuarter || !allEnrollments || !onImportFromQuarter) return null;
    const prevQ = getPreviousQuarter(selectedQuarter);
    const prevEnrollments = allEnrollments.filter(
      (e) => e.courseId === _courseId && e.quarter === prevQ && isActiveEnrollment(e)
    );
    return { quarter: prevQ, enrollments: prevEnrollments };
  }, [selectedQuarter, allEnrollments, _courseId, onImportFromQuarter]);

  const showImportCTA = enrollments.length === 0
    && prevQuarterData !== null
    && prevQuarterData.enrollments.length > 0;

  // 수강생별 납부 현황
  const tableData = useMemo(() => {
    return enrollments.map((enrollment) => {
      const student = getStudentById(enrollment.studentId);
      const enrollmentRecords = records
        .filter((r) => r.enrollmentId === enrollment.id)
        .sort((a, b) => (b.paidAt || '').localeCompare(a.paidAt || ''));
      // enrollment 데이터를 source of truth로 사용 (payment_records는 이력 표시용)
      const totalPaid = enrollment.paidAmount;
      const effectiveFee = courseFee - (enrollment.discountAmount ?? 0);
      const remaining = Math.max(0, enrollment.remainingAmount);

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

  // Filtered data based on status filter
  const filteredData = useMemo(() => {
    if (statusFilter === 'all') return tableData;
    return tableData.filter((d) => d.enrollment.paymentStatus === statusFilter);
  }, [tableData, statusFilter]);

  // 통계
  const stats = useMemo(() => {
    const nonExempt = tableData.filter((d) => d.enrollment.paymentStatus !== 'exempt');
    const paidCount = nonExempt.filter((d) => d.enrollment.paymentStatus === 'completed').length;
    const totalPaid = nonExempt.reduce((sum, d) => sum + d.totalPaid, 0);
    const expectedTotal = nonExempt.reduce((sum, d) => sum + d.effectiveFee, 0);
    return { paidCount, totalPaid, expectedTotal, totalStudents: enrollments.length };
  }, [tableData, enrollments.length]);

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
    toast.success('할인 금액이 업데이트되었습니다.');
  }, [records, updateEnrollmentPayment, courseFee]);

  // Reset form
  const resetForm = useCallback(() => {
    setFormAmount(undefined);
    setFormPaymentMethod(undefined);
    setFormPaidAt(dayjs().format('YYYY-MM-DD'));
    setFormNotes('');
    setFormDiscountAmount(0);
  }, []);

  // 납부 추가
  const handleAddPayment = useCallback(async () => {
    try {
      if (!selectedEnrollmentId) return;
      if (formAmount === undefined || formAmount < 0) return;
      if (!formPaidAt) return;

      // 할인 변경 확인
      const enrollment = enrollments.find((e) => e.id === selectedEnrollmentId);
      const newDiscount = formDiscountAmount ?? 0;
      if (enrollment && newDiscount !== (enrollment.discountAmount ?? 0)) {
        await handleDiscountChange(enrollment, newDiscount);
      }

      // 납부 기록 추가 (금액이 있을 때만)
      if (formAmount > 0) {
        await addPayment(
          selectedEnrollmentId,
          formAmount,
          courseFee,
          formPaymentMethod,
          formPaidAt,
          formNotes || undefined,
        );
      }

      toast.success('납부가 기록되었습니다.');
      resetForm();
      setIsPaymentModalVisible(false);
      setSelectedEnrollmentId(null);
    } catch (error) {
      console.error('Payment failed:', error);
    }
  }, [selectedEnrollmentId, formAmount, formPaymentMethod, formPaidAt, formNotes, formDiscountAmount, addPayment, courseFee, enrollments, handleDiscountChange, resetForm]);

  // 납부 삭제
  const handleDeletePayment = useCallback(async (recordId: string) => {
    await deletePayment(recordId, courseFee);
    toast.success('납부 기록이 삭제되었습니다.');
  }, [deletePayment, courseFee]);

  // 면제 처리
  const handleExempt = useCallback(async (enrollment: Enrollment) => {
    await updateEnrollmentPayment(
      enrollment.id, 0, courseFee, dayjs().format('YYYY-MM-DD'), true,
    );
    toast.success('수강료가 면제 처리되었습니다.');
  }, [updateEnrollmentPayment, courseFee]);

  // 면제 취소
  const handleCancelExempt = useCallback(async (enrollment: Enrollment) => {
    const enrollmentRecords = records.filter((r) => r.enrollmentId === enrollment.id);
    const totalPaid = enrollmentRecords.reduce((sum, r) => sum + r.amount, 0);
    await updateEnrollmentPayment(
      enrollment.id, totalPaid, courseFee, undefined, false,
      undefined, enrollment.discountAmount,
    );
    toast.success('면제가 취소되었습니다.');
  }, [updateEnrollmentPayment, courseFee, records]);

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
    toast.success('완납 처리되었습니다.');
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
    toast.success(`${unpaid.length}명의 완납이 처리되었습니다.`);
  }, [tableData, addPayment, courseFee]);

  // 선택된 수강생 데이터 (납부 모달 + 이력 모달 공용)
  const selectedData = useMemo(() => {
    if (!selectedEnrollmentId) return null;
    return tableData.find((d) => d.key === selectedEnrollmentId) ?? null;
  }, [selectedEnrollmentId, tableData]);

  // Row selection state for TanStack Table
  const tanstackRowSelection = useMemo(() => {
    if (!rowSelection) return {};
    const sel: Record<string, boolean> = {};
    for (const key of rowSelection.selectedRowKeys) {
      const idx = filteredData.findIndex((d) => d.key === key);
      if (idx >= 0) sel[String(idx)] = true;
    }
    return sel;
  }, [rowSelection, filteredData]);

  // 메인 테이블 컬럼
  const columns: ColumnDef<TableDataRow>[] = useMemo(() => [
    ...(rowSelection ? [{
      id: 'select',
      header: ({ table }: { table: ReturnType<typeof useReactTable<TableDataRow>> }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected()}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }: { row: { getIsSelected: () => boolean; toggleSelected: (v: boolean) => void } }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
        />
      ),
      enableSorting: false,
      size: 40,
    } as ColumnDef<TableDataRow>] : []),
    {
      accessorKey: 'studentName',
      header: '이름',
      size: 80,
      cell: ({ row }) => {
        const record = row.original;
        return onStudentClick && record.student ? (
          <button
            type="button"
            className="text-primary hover:underline whitespace-nowrap"
            onClick={() => onStudentClick(record.student!.id)}
          >
            {record.studentName}
          </button>
        ) : (
          <span className="whitespace-nowrap">{record.studentName}</span>
        );
      },
    },
    ...(showMemberColumn ? [{
      id: 'member',
      header: '회원',
      size: 60,
      enableSorting: true,
      accessorFn: (row: TableDataRow) => row.student?.isMember ? 1 : 0,
      sortingFn: 'basic' as const,
      cell: ({ row }: { row: any }) => {
        const m = row.original.student?.isMember;
        return m ? <Badge variant="info">회원</Badge> : null;
      },
    } as ColumnDef<TableDataRow>] : []),
    {
      id: 'phone',
      header: '전화번호',
      size: 120,
      cell: ({ row }) => (
        <span className="whitespace-nowrap">{row.original.student?.phone || '-'}</span>
      ),
    },
    {
      id: 'status',
      header: '납부상태',
      size: 80,
      accessorFn: (row) => row.enrollment.paymentStatus,
      cell: ({ row }) => {
        const s = row.original.enrollment.paymentStatus;
        if (s === 'exempt') return <Badge className="bg-purple-100 text-purple-800 border-purple-200 hover:bg-purple-100">면제</Badge>;
        if (s === 'completed') return <Badge className="bg-green-100 text-green-800 border-green-200 hover:bg-green-100">완납</Badge>;
        if (s === 'partial') return <Badge className="bg-orange-100 text-orange-800 border-orange-200 hover:bg-orange-100">부분납부</Badge>;
        return <Badge className="bg-red-100 text-red-800 border-red-200 hover:bg-red-100">미납</Badge>;
      },
    },
    {
      id: 'paid',
      header: '납부액',
      size: 100,
      cell: ({ row }) => {
        const record = row.original;
        if (record.enrollment.paymentStatus === 'exempt') return '-';
        return (
          <span className="whitespace-nowrap">
            {'\u20A9'}{record.totalPaid.toLocaleString()}
          </span>
        );
      },
    },
    {
      id: 'lastPaidAt',
      header: '최근 납부일',
      size: 100,
      cell: ({ row }) => {
        const record = row.original;
        const lastRecord = record.records[0];
        if (!lastRecord?.paidAt) return <span className="text-muted-foreground">-</span>;
        return (
          <span
            className="whitespace-nowrap cursor-pointer hover:underline text-primary"
            onClick={() => {
              setSelectedEnrollmentId(record.enrollment.id);
              setIsHistoryModalVisible(true);
            }}
          >
            {dayjs(lastRecord.paidAt).format('YY.MM.DD')}
          </span>
        );
      },
    },
    {
      accessorKey: 'remaining',
      header: '잔액',
      size: 90,
      cell: ({ row }) => {
        const record = row.original;
        if (record.enrollment.paymentStatus === 'exempt') return '-';
        return (
          <span className={cn(
            'whitespace-nowrap font-semibold',
            record.remaining > 0 ? 'text-destructive' : 'text-green-600',
          )}>
            {'\u20A9'}{record.remaining.toLocaleString()}
          </span>
        );
      },
    },
    {
      id: 'actions',
      header: '',
      size: 200,
      cell: ({ row }) => {
        const record = row.original;
        if (record.enrollment.paymentStatus === 'exempt') {
          return (
            <div className="flex items-center gap-1">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm">면제 취소</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>면제 취소</AlertDialogTitle>
                    <AlertDialogDescription>면제를 취소하시겠습니까?</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>닫기</AlertDialogCancel>
                    <AlertDialogAction onClick={() => handleCancelExempt(record.enrollment)}>
                      취소하기
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          );
        }
        return (
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="border-primary text-primary hover:bg-primary/10"
              onClick={() => {
                const discount = record.enrollment.discountAmount ?? 0;
                setSelectedEnrollmentId(record.enrollment.id);
                setModalDiscount(discount);
                setFormAmount(record.remaining > 0 ? record.remaining : undefined);
                setFormPaidAt(dayjs().format('YYYY-MM-DD'));
                setFormDiscountAmount(discount);
                setFormPaymentMethod(undefined);
                setFormNotes('');
                setIsPaymentModalVisible(true);
              }}
            >
              납부
            </Button>
            {record.remaining > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleFullPayment(record.enrollment)}
              >
                완납
              </Button>
            )}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm">면제</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>수강료 면제</AlertDialogTitle>
                  <AlertDialogDescription>수강료를 면제 처리하시겠습니까?</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>취소</AlertDialogCancel>
                  <AlertDialogAction onClick={() => handleExempt(record.enrollment)}>
                    면제
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        );
      },
    },
  ], [onStudentClick, rowSelection, handleCancelExempt, handleExempt, handleFullPayment]);

  const table = useReactTable<TableDataRow>({
    data: filteredData,
    columns,
    state: {
      sorting,
      columnFilters,
      rowSelection: tanstackRowSelection,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onRowSelectionChange: (updater) => {
      if (!rowSelection) return;
      const newSelection = typeof updater === 'function' ? updater(tanstackRowSelection) : updater;
      const keys = Object.entries(newSelection)
        .filter(([, v]) => v)
        .map(([idx]) => filteredData[Number(idx)]?.key)
        .filter(Boolean);
      rowSelection.onChange(keys);
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <div>
      {/* 통계 + 전체 완납 */}
      <div className="mb-4 p-3 bg-muted/50 rounded-md flex items-center gap-6">
        {quarterSelector && <div style={{ flexShrink: 0 }}>{quarterSelector}</div>}
        <div>
          <span className="text-xs text-muted-foreground">완납 인원</span>
          <div className="font-semibold">
            <span className="text-green-600">{stats.paidCount}</span>
            <span className="text-muted-foreground"> / {stats.totalStudents}명</span>
          </div>
        </div>
        <div>
          <span className="text-xs text-muted-foreground">납부 합계</span>
          <div className="font-semibold text-green-600">{'\u20A9'}{stats.totalPaid.toLocaleString()}</div>
        </div>
        <div>
          <span className="text-xs text-muted-foreground">예상 합계</span>
          <div className="font-semibold">{'\u20A9'}{stats.expectedTotal.toLocaleString()}</div>
        </div>
        <div>
          <span className="text-xs text-muted-foreground">수납률</span>
          <div className={cn(
            'font-semibold',
            stats.expectedTotal > 0 && stats.totalPaid < stats.expectedTotal
              ? 'text-destructive' : 'text-green-600',
          )}>
            {stats.expectedTotal > 0 ? Math.round((stats.totalPaid / stats.expectedTotal) * 100) : 0}%
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          {rowSelection && rowSelection.selectedRowKeys.length > 0 && (
            <>
              <span style={{ fontSize: '0.93rem', color: 'hsl(var(--muted-foreground))' }}>{rowSelection.selectedRowKeys.length}명 선택</span>
              {onRemoveEnrollments && (
                <Button size="sm" variant="destructive" onClick={() => { setRefundAmount(0); setWithdrawDialogOpen(true); }}>
                  수강 철회
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => rowSelection.onChange([])}>
                해제
              </Button>
              <div style={{ width: 1, height: 20, background: 'hsl(var(--border))' }} />
            </>
          )}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger style={{ width: 100, height: 32, fontSize: '0.86rem' }}>
              <SelectValue placeholder="전체" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체</SelectItem>
              <SelectItem value="completed">완납</SelectItem>
              <SelectItem value="partial">부분납부</SelectItem>
              <SelectItem value="pending">미납</SelectItem>
              <SelectItem value="exempt">면제</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" onClick={handleBulkFullPayment}>
            전체 완납
          </Button>
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
                  style={{
                    width: header.getSize(),
                    cursor: header.column.getCanSort() ? 'pointer' : undefined,
                    userSelect: header.column.getCanSort() ? 'none' : undefined,
                  }}
                  onClick={header.column.getToggleSortingHandler()}
                >
                  {header.isPlaceholder ? null : (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getCanSort() && (
                        <span style={{ fontSize: '0.71rem', opacity: header.column.getIsSorted() ? 1 : 0.3 }}>
                          {header.column.getIsSorted() === 'asc' ? '▲' : header.column.getIsSorted() === 'desc' ? '▼' : '⇅'}
                        </span>
                      )}
                    </span>
                  )}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center">
                {showImportCTA ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                    <p className="text-muted-foreground">이 분기에 등록된 수강생이 없습니다</p>
                    <Button
                      variant="outline"
                      onClick={() => {
                        const checked: Record<string, boolean> = {};
                        prevQuarterData!.enrollments.forEach((e) => {
                          checked[e.studentId] = e.paymentStatus !== 'withdrawn';
                        });
                        setImportChecked(checked);
                        setImportDialogOpen(true);
                      }}
                    >
                      {getQuarterLabel(prevQuarterData!.quarter)} 수강생 {prevQuarterData!.enrollments.length}명 가져오기
                    </Button>
                  </div>
                ) : (
                  <span className="text-muted-foreground">수강생이 없습니다</span>
                )}
              </TableCell>
            </TableRow>
          ) : (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() ? 'selected' : undefined}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id} style={{ width: cell.column.getSize() }}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {/* 납부 추가 모달 */}
      <Dialog
        open={isPaymentModalVisible}
        onOpenChange={(open) => {
          if (!open) {
            setIsPaymentModalVisible(false);
            setSelectedEnrollmentId(null);
            resetForm();
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>납부 -- {selectedData?.studentName ?? ''}</DialogTitle>
            <DialogDescription className="sr-only">납부 정보를 입력합니다</DialogDescription>
          </DialogHeader>

          {/* 수강료 요약 + 할인 인라인 */}
          {selectedData && (() => {
            const modalEffectiveFee = courseFee - modalDiscount;
            const modalRemaining = Math.max(0, modalEffectiveFee - selectedData.totalPaid);
            return (
              <div className="p-3 bg-muted/50 rounded-md space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">수강료</span>
                  <span className="font-semibold">{'\u20A9'}{courseFee.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">할인</span>
                  <Input
                    type="number"
                    min={0}
                    max={courseFee}
                    step={5000}
                    value={formDiscountAmount || ''}
                    onChange={(e) => {
                      const newDiscount = Number(e.target.value) || 0;
                      setFormDiscountAmount(newDiscount);
                      setModalDiscount(newDiscount);
                      const newRemaining = Math.max(0, courseFee - newDiscount - selectedData.totalPaid);
                      setFormAmount(newRemaining);
                    }}
                    placeholder="0"
                    className="h-7 w-[120px] text-right text-sm [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  />
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">기납부액</span>
                  <span>{'\u20A9'}{selectedData.totalPaid.toLocaleString()}</span>
                </div>
                <div className="flex justify-between pt-1.5 border-t font-semibold text-[15px]">
                  <span>납부할 금액</span>
                  <span className={modalRemaining > 0 ? 'text-destructive' : 'text-green-600'}>
                    {'\u20A9'}{modalRemaining.toLocaleString()}
                  </span>
                </div>
              </div>
            );
          })()}

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>납부 금액 <span className="text-destructive">*</span></Label>
              <Input
                type="number"
                min={0}
                step={5000}
                value={formAmount ?? ''}
                onChange={(e) => setFormAmount(e.target.value ? Number(e.target.value) : undefined)}
              />
            </div>
            <div className="space-y-2">
              <Label>납부 방법</Label>
              <Select value={formPaymentMethod ?? ''} onValueChange={(v) => setFormPaymentMethod((v || undefined) as PaymentMethod | undefined)}>
                <SelectTrigger>
                  <SelectValue placeholder="선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="transfer">계좌이체</SelectItem>
                  <SelectItem value="card">카드</SelectItem>
                  <SelectItem value="cash">현금</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>납부일 <span className="text-destructive">*</span></Label>
              <Input
                type="date"
                value={formPaidAt}
                onChange={(e) => setFormPaidAt(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>메모</Label>
              <Input
                placeholder="메모"
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsPaymentModalVisible(false);
                setSelectedEnrollmentId(null);
                resetForm();
              }}
            >
              취소
            </Button>
            <Button onClick={handleAddPayment}>납부 기록</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 납부 이력 모달 */}
      <Dialog
        open={isHistoryModalVisible}
        onOpenChange={(open) => {
          if (!open) {
            setIsHistoryModalVisible(false);
            setSelectedEnrollmentId(null);
          }
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>납부 이력 -- {selectedData?.studentName ?? ''}</DialogTitle>
            <DialogDescription className="sr-only">납부 이력을 확인합니다</DialogDescription>
          </DialogHeader>

          {(selectedData?.records ?? []).length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              납부 이력이 없습니다
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 400, overflowY: 'auto' }}>
              {(selectedData?.records ?? []).map((r) => (
                <div
                  key={r.id}
                  className="rounded-lg border bg-card"
                  style={{ padding: '12px 16px' }}
                >
                  {/* 상단: 금액 + 방법 + 삭제 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <Input
                      type="number"
                      step={5000}
                      className="h-7 text-[1.07rem] font-semibold w-[120px] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      defaultValue={r.amount}
                      onBlur={(e) => {
                        const val = Number(e.target.value);
                        if (!isNaN(val) && val !== r.amount) {
                          updateRecord(r.id, { amount: val });
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="text-xs px-2 py-0.5 rounded-full border cursor-pointer hover:bg-muted transition-colors"
                      onClick={() => {
                        const methods = Object.values(PaymentMethodEnum) as PaymentMethod[];
                        const currentIdx = methods.indexOf(r.paymentMethod as PaymentMethod);
                        const next = methods[(currentIdx + 1) % methods.length];
                        updateRecord(r.id, { paymentMethod: next });
                      }}
                    >
                      {r.paymentMethod
                        ? PAYMENT_METHOD_LABELS[r.paymentMethod as keyof typeof PAYMENT_METHOD_LABELS]
                        : '-'}
                    </button>
                    <div style={{ marginLeft: 'auto' }}>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 rounded-full text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10">
                            <X className="h-3 w-3" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>납부 기록 삭제</AlertDialogTitle>
                            <AlertDialogDescription>삭제하시겠습니까?</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>취소</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              onClick={() => handleDeletePayment(r.id)}
                            >
                              삭제
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                  {/* 하단: 날짜 + 메모 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Input
                      type="date"
                      className="h-7 text-sm w-[140px] cursor-pointer"
                      defaultValue={r.paidAt || ''}
                      onClick={(e) => (e.target as HTMLInputElement).showPicker?.()}
                      onBlur={(e) => {
                        const val = e.target.value;
                        if (val && val !== (r.paidAt || '')) {
                          updateRecord(r.id, { paidAt: val });
                        }
                      }}
                    />
                    <Input
                      className="h-7 text-xs flex-1"
                      defaultValue={r.notes ?? ''}
                      placeholder="메모 입력"
                      onBlur={(e) => {
                        const val = e.target.value;
                        if (val !== (r.notes ?? '')) {
                          updateRecord(r.id, { notes: val || undefined });
                        }
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
      {/* 수강 철회 확인 다이얼로그 */}
      <AlertDialog open={withdrawDialogOpen} onOpenChange={setWithdrawDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>수강 철회</AlertDialogTitle>
            <AlertDialogDescription>
              {rowSelection?.selectedRowKeys.length || 0}명의 수강을 철회합니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div style={{ padding: '0 24px 16px' }}>
            {(() => {
              const selectedIds = (rowSelection?.selectedRowKeys || []) as string[];
              const selectedRows = filteredData.filter((d) => selectedIds.includes(d.key));
              const totalPaid = selectedRows.reduce((sum, d) => sum + d.totalPaid, 0);
              return (
                <>
                  <div style={{ fontSize: '0.86rem', color: 'hsl(var(--muted-foreground))', marginBottom: 8, padding: '8px 12px', background: 'hsl(var(--muted) / 0.5)', borderRadius: 6 }}>
                    기납부 합계: <span style={{ fontWeight: 600, color: 'hsl(var(--foreground))' }}>₩{totalPaid.toLocaleString()}</span>
                  </div>
                  <Label style={{ marginBottom: 6, display: 'block' }}>환불 금액 (원)</Label>
                  <Input
                    type="number"
                    step={5000}
                    value={refundAmount || ''}
                    onChange={(e) => {
                      const val = Number(e.target.value) || 0;
                      setRefundAmount(Math.min(val, totalPaid));
                    }}
                    placeholder="0 (환불 없음)"
                    min={0}
                    max={totalPaid}
                  />
                  <p style={{ fontSize: '0.79rem', color: 'hsl(var(--muted-foreground))', marginTop: 4 }}>
                    최대 ₩{totalPaid.toLocaleString()} 환불 가능
                  </p>
                </>
              );
            })()}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (onRemoveEnrollments && rowSelection) {
                  onRemoveEnrollments(rowSelection.selectedRowKeys as string[], refundAmount || 0);
                }
                setWithdrawDialogOpen(false);
              }}
            >
              철회
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* 이전 분기 가져오기 다이얼로그 */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{prevQuarterData ? getQuarterLabel(prevQuarterData.quarter) : ''} 수강생 가져오기</DialogTitle>
            <DialogDescription className="sr-only">이전 분기 수강생을 가져옵니다</DialogDescription>
          </DialogHeader>
          <div style={{ maxHeight: 400, overflowY: 'auto' }}>
            {prevQuarterData?.enrollments.map((e) => {
              const student = getStudentById(e.studentId);
              return (
                <label
                  key={e.studentId}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 4px', borderBottom: '1px solid hsl(var(--border))',
                    cursor: 'pointer',
                  }}
                >
                  <Checkbox
                    checked={importChecked[e.studentId] ?? false}
                    onCheckedChange={(v) => setImportChecked((prev) => ({ ...prev, [e.studentId]: !!v }))}
                  />
                  <span style={{ flex: 1 }}>{student?.name || '-'}</span>
                  <span style={{ fontSize: '0.86rem', color: 'hsl(var(--muted-foreground))' }}>
                    {student?.phone || ''}
                  </span>
                </label>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportDialogOpen(false)}>
              취소
            </Button>
            <Button
              onClick={async () => {
                const studentIds = Object.entries(importChecked)
                  .filter(([, v]) => v)
                  .map(([id]) => id);
                if (studentIds.length > 0 && onImportFromQuarter && selectedQuarter) {
                  await onImportFromQuarter(studentIds, selectedQuarter);
                }
                setImportDialogOpen(false);
              }}
              disabled={Object.values(importChecked).filter(Boolean).length === 0}
            >
              {Object.values(importChecked).filter(Boolean).length}명 가져오기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PaymentManagementTable;
