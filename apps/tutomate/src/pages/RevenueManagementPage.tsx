import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Download,
  FileSpreadsheet,
  FileText,
  Calendar,
} from 'lucide-react';
import { toast } from 'sonner';
import dayjs from 'dayjs';
import {
  EXEMPT_COLOR,
  useCourseStore,
  useStudentStore,
  useEnrollmentStore,
  usePaymentRecordStore,
  PAYMENT_METHOD_LABELS,
  exportRevenueToExcel,
  exportRevenueToCSV,
  REVENUE_EXPORT_FIELDS,
  getCurrentQuarter,
  getQuarterOptions,
} from '@tutomate/core';
import type { Enrollment } from '@tutomate/core';
import { PaymentForm, PageEnter, RevenueBreakdownTooltip, DatePicker } from '@tutomate/ui';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog';

const RevenueManagementPage: React.FC = () => {
  const navigate = useNavigate();
  const { courses, loadCourses, getCourseById } = useCourseStore();
  const { students, loadStudents } = useStudentStore();
  const { enrollments, loadEnrollments } = useEnrollmentStore();
  const { loadRecords, records } = usePaymentRecordStore();

  const [selectedEnrollment, setSelectedEnrollment] = useState<Enrollment | null>(null);
  const [isPaymentModalVisible, setIsPaymentModalVisible] = useState(false);
  const [isExportModalVisible, setIsExportModalVisible] = useState(false);
  const [selectedExportFields, setSelectedExportFields] = useState<string[]>(['courseName', 'studentName', 'fee', 'paidAmount', 'remainingAmount', 'paymentStatus']);
  const [dateRange, setDateRange] = useState<[string, string]>(['', '']);
  const [filterMode, setFilterMode] = useState<'quarter' | 'date'>('quarter');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string[]>([]);

  const [selectedQuarter, setSelectedQuarter] = useState<string>(getCurrentQuarter());
  const goToCourse = (courseId: string) =>
    navigate(`/courses/${courseId}?q=${encodeURIComponent(selectedQuarter)}`);

  useEffect(() => {
    loadCourses();
    loadStudents();
    loadEnrollments();
    loadRecords();
  }, [loadCourses, loadStudents, loadEnrollments, loadRecords]);

  // 필터링된 수강 신청 — filterMode에 따라 분기 OR 날짜 상호 배타
  const filteredEnrollments = useMemo(() => {
    // withdrawn 포함 — 환불 금액이 수익에 반영되어야 함
    let filtered: typeof enrollments;

    if (filterMode === 'quarter') {
      filtered = enrollments.filter((e) => (e.quarter === selectedQuarter || !e.quarter));
    } else {
      filtered = [...enrollments];
      if (dateRange[0] && dateRange[1]) {
        const startDate = dayjs(dateRange[0]).startOf('day');
        const endDate = dayjs(dateRange[1]).endOf('day');
        filtered = filtered.filter((enrollment) => {
          const enrollDate = dayjs(enrollment.enrolledAt);
          return !enrollDate.isBefore(startDate) && !enrollDate.isAfter(endDate);
        });
      }
    }

    if (paymentStatusFilter.length > 0) {
      filtered = filtered.filter((enrollment) =>
        paymentStatusFilter.includes(enrollment.paymentStatus)
      );
    }

    return filtered;
  }, [enrollments, filterMode, dateRange, paymentStatusFilter, selectedQuarter]);

  // 수익 집계 대상: exempt 제외
  const revenueEnrollments = useMemo(() => filteredEnrollments.filter((e) => e.paymentStatus !== 'exempt'), [filteredEnrollments]);

  const courseMap = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses]);
  const studentMap = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);

  const { totalRevenue, expectedRevenue, totalUnpaid, completedPayments, partialPayments, pendingPayments, exemptPayments, withdrawnPayments } = useMemo(() => {
    // active = withdrawn 제외 → 예상수익/미수금 계산용
    const active = revenueEnrollments.filter((e) => e.paymentStatus !== 'withdrawn');
    // 총수익: active + withdrawn(환불 net) 모두
    const revenue = revenueEnrollments.reduce((sum, e) => sum + e.paidAmount, 0);
    // 예상수익: active만, 할인 반영
    const expected = active.reduce((sum, e) => {
      const fee = courseMap.get(e.courseId)?.fee ?? 0;
      return sum + Math.max(0, fee - (e.discountAmount ?? 0));
    }, 0);
    const activeRevenueTotal = active.reduce((sum, e) => sum + e.paidAmount, 0);
    return {
      totalRevenue: revenue,
      expectedRevenue: expected,
      totalUnpaid: Math.max(0, expected - activeRevenueTotal),
      completedPayments: filteredEnrollments.filter((e) => e.paymentStatus === 'completed').length,
      partialPayments: filteredEnrollments.filter((e) => e.paymentStatus === 'partial').length,
      pendingPayments: filteredEnrollments.filter((e) => e.paymentStatus === 'pending').length,
      exemptPayments: filteredEnrollments.filter((e) => e.paymentStatus === 'exempt').length,
      withdrawnPayments: filteredEnrollments.filter((e) => e.paymentStatus === 'withdrawn').length,
    };
  }, [revenueEnrollments, filteredEnrollments, courseMap]);

  // 강좌별 수익 테이블 데이터
  const courseRevenueData = useMemo(() => courses.map((course) => {
    const courseEnrollments = filteredEnrollments.filter((e) => e.courseId === course.id);
    const nonExemptEnrollments = courseEnrollments.filter((e) => e.paymentStatus !== 'exempt');
    const activeEnrollments = nonExemptEnrollments.filter((e) => e.paymentStatus !== 'withdrawn');
    // 수익: 환불 net 포함
    const revenue = nonExemptEnrollments.reduce((sum, e) => sum + e.paidAmount, 0);
    // 예상수익: active의 effectiveFee
    const expected = activeEnrollments.reduce(
      (sum, e) => sum + Math.max(0, course.fee - (e.discountAmount ?? 0)),
      0,
    );
    const activeRevenueLocal = activeEnrollments.reduce((sum, e) => sum + e.paidAmount, 0);
    const unpaid = Math.max(0, expected - activeRevenueLocal);
    const completed = courseEnrollments.filter((e) => e.paymentStatus === 'completed').length;
    // 활성 수강생 기준 완납률
    const completionRate = activeEnrollments.length > 0 ? (completed / activeEnrollments.length) * 100 : 0;

    const withdrawnCount = courseEnrollments.filter((e) => e.paymentStatus === 'withdrawn').length;
    const enrollmentIds = new Set(courseEnrollments.map((e) => e.id));
    const courseRecords = records.filter((r) => enrollmentIds.has(r.enrollmentId));
    const refundTotal = Math.abs(courseRecords.filter((r) => r.amount < 0).reduce((sum, r) => sum + r.amount, 0));
    const withdrawnKept = courseEnrollments
      .filter((e) => e.paymentStatus === 'withdrawn')
      .reduce((sum, e) => sum + e.paidAmount, 0);
    return {
      courseId: course.id,
      courseName: course.name,
      studentCount: activeEnrollments.length,
      totalEnrollments: courseEnrollments.length,
      withdrawnCount,
      revenue,
      refundTotal,
      withdrawnKept,
      expected,
      unpaid,
      completionRate,
      completedCount: completed,
      activeCount: activeEnrollments.length,
      revenueEnrollments: nonExemptEnrollments,
      courseRecords,
    };
  }), [courses, filteredEnrollments, records]);

  // 미납자 목록 (면제/완납/포기 제외 → pending/partial만)
  const unpaidList = useMemo(() => filteredEnrollments
    .filter((e) => e.paymentStatus === 'pending' || e.paymentStatus === 'partial')
    .map((enrollment) => {
      const student = studentMap.get(enrollment.studentId);
      const course = courseMap.get(enrollment.courseId);

      return {
        ...enrollment,
        studentName: student?.name || '-',
        studentPhone: student?.phone || '-',
        courseName: course?.name || '-',
        courseFee: course?.fee || 0,
        paymentMethod: enrollment.paymentMethod,
        discountAmount: enrollment.discountAmount ?? 0,
      };
    }), [filteredEnrollments, studentMap, courseMap]);

  // 분기별 수익 현황 (강좌별)
  // - 분기 매칭된 모든 enrollment(withdrawn 포함)에서 환불 net 수익 합산
  // - 예상수익은 활성(active) + 할인 반영
  const quarterRevenueData = useMemo(() => {
    return courses.map((course) => {
      const quarterAll = enrollments.filter(
        (e) => e.courseId === course.id && e.quarter === selectedQuarter,
      );
      const nonExempt = quarterAll.filter((e) => e.paymentStatus !== 'exempt');
      const active = nonExempt.filter((e) => e.paymentStatus !== 'withdrawn');
      const quarterRevenue = nonExempt.reduce((sum, e) => sum + e.paidAmount, 0);
      const quarterExpected = active.reduce(
        (sum, e) => sum + Math.max(0, course.fee - (e.discountAmount ?? 0)),
        0,
      );
      const activeRevenueLocal = active.reduce((sum, e) => sum + e.paidAmount, 0);
      const paidCount = active.filter((e) => e.paymentStatus === 'completed').length;
      const unpaidCount = active.length - paidCount;
      const collectionRate = quarterExpected > 0 ? (activeRevenueLocal / quarterExpected) * 100 : 0;

      const withdrawnCount = quarterAll.filter((e) => e.paymentStatus === 'withdrawn').length;
      const enrollmentIds = new Set(quarterAll.map((e) => e.id));
      const courseRecords = records.filter((r) => enrollmentIds.has(r.enrollmentId));
      const refundTotal = Math.abs(courseRecords.filter((r) => r.amount < 0).reduce((sum, r) => sum + r.amount, 0));
      const withdrawnKept = quarterAll
        .filter((e) => e.paymentStatus === 'withdrawn')
        .reduce((sum, e) => sum + e.paidAmount, 0);
      return {
        courseId: course.id,
        courseName: course.name,
        studentCount: active.length,
        withdrawnCount,
        paidCount,
        unpaidCount,
        quarterRevenue,
        quarterExpected,
        refundTotal,
        withdrawnKept,
        collectionRate,
        revenueEnrollments: nonExempt,
        courseRecords,
      };
    }).filter((d) => d.studentCount > 0 || d.withdrawnCount > 0);
  }, [courses, enrollments, selectedQuarter, records]);

  const quarterTotalRevenue = useMemo(() => quarterRevenueData.reduce((sum, d) => sum + d.quarterRevenue, 0), [quarterRevenueData]);
  const quarterTotalExpected = useMemo(() => quarterRevenueData.reduce((sum, d) => sum + d.quarterExpected, 0), [quarterRevenueData]);

  const handlePaymentEdit = (enrollment: Enrollment) => {
    setSelectedEnrollment(enrollment);
    setIsPaymentModalVisible(true);
  };

  const setQuickDateRange = (type: 'this-month' | 'last-month' | 'this-year' | 'all') => {
    switch (type) {
      case 'this-month':
        setDateRange([dayjs().startOf('month').format('YYYY-MM-DD'), dayjs().endOf('month').format('YYYY-MM-DD')]);
        break;
      case 'last-month':
        setDateRange([
          dayjs().subtract(1, 'month').startOf('month').format('YYYY-MM-DD'),
          dayjs().subtract(1, 'month').endOf('month').format('YYYY-MM-DD'),
        ]);
        break;
      case 'this-year':
        setDateRange([dayjs().startOf('year').format('YYYY-MM-DD'), dayjs().endOf('year').format('YYYY-MM-DD')]);
        break;
      case 'all':
        setDateRange(['', '']);
        break;
    }
  };

  const isQuickRange = (type: 'this-month' | 'last-month' | 'this-year' | 'all') => {
    switch (type) {
      case 'all': return !dateRange[0] && !dateRange[1];
      case 'this-month': return dateRange[0] === dayjs().startOf('month').format('YYYY-MM-DD') && dateRange[1] === dayjs().endOf('month').format('YYYY-MM-DD');
      case 'last-month': return dateRange[0] === dayjs().subtract(1, 'month').startOf('month').format('YYYY-MM-DD') && dateRange[1] === dayjs().subtract(1, 'month').endOf('month').format('YYYY-MM-DD');
      case 'this-year': return dateRange[0] === dayjs().startOf('year').format('YYYY-MM-DD') && dateRange[1] === dayjs().endOf('year').format('YYYY-MM-DD');
    }
  };

  const handleExport = (type: 'excel' | 'csv') => {
    if (selectedExportFields.length === 0) {
      toast.warning('내보낼 필드를 1개 이상 선택해주세요.');
      return;
    }

    if (enrollments.length === 0) {
      toast.warning('내보낼 수익 데이터가 없습니다');
      return;
    }

    try {
      if (type === 'excel') {
        exportRevenueToExcel(enrollments, students, courses, selectedExportFields);
        toast.success('Excel 파일이 다운로드되었습니다');
      } else {
        exportRevenueToCSV(enrollments, students, courses, 'utf-8', selectedExportFields);
        toast.success('CSV 파일이 다운로드되었습니다');
      }
      setIsExportModalVisible(false);
    } catch (error) {
      toast.error('파일 내보내기에 실패했습니다');
    }
  };

  const allRevenueFieldKeys = useMemo(() => REVENUE_EXPORT_FIELDS.map((f) => f.key), []);
  const isAllRevenueSelected = selectedExportFields.length === allRevenueFieldKeys.length;

  const statusMap: Record<string, { label: string; variant: 'error' | 'warning' | 'success' | 'purple' }> = {
    pending: { label: '미납', variant: 'error' },
    partial: { label: '부분납부', variant: 'warning' },
    completed: { label: '완납', variant: 'success' },
    exempt: { label: '면제', variant: 'purple' },
  };

  return (
    <PageEnter>
      {/* 필터 섹션 — 한 줄 통합 */}
      <Card className="mb-6">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              {/* 기간 모드 토글 */}
              <div className="inline-flex rounded-md border p-0.5 bg-muted/30">
                <button
                  type="button"
                  onClick={() => { setFilterMode('quarter'); setDateRange(['', '']); }}
                  className={`px-3 py-1 text-sm rounded transition-colors ${filterMode === 'quarter' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  분기
                </button>
                <button
                  type="button"
                  onClick={() => setFilterMode('date')}
                  className={`px-3 py-1 text-sm rounded transition-colors ${filterMode === 'date' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  날짜 지정
                </button>
              </div>

              {filterMode === 'quarter' ? (
                <>
                  <Select value={selectedQuarter} onValueChange={setSelectedQuarter}>
                    <SelectTrigger className="w-[170px] h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {getQuarterOptions().map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="sm" onClick={() => setSelectedQuarter(getCurrentQuarter())}>
                    이번 분기
                  </Button>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-1.5">
                    <DatePicker size="sm" className="w-[170px]"
                      value={dateRange[0]}
                      onChange={(v) => setDateRange([v, dateRange[1]])} />
                    <span className="text-muted-foreground">~</span>
                    <DatePicker size="sm" className="w-[170px]"
                      value={dateRange[1]}
                      onChange={(v) => setDateRange([dateRange[0], v])} />
                  </div>
                  <div className="flex gap-1">
                    {([
                      { type: 'this-month' as const, label: '이번 달' },
                      { type: 'last-month' as const, label: '지난 달' },
                      { type: 'this-year' as const, label: '올해' },
                    ] as const).map(({ type, label }) => (
                      <Button key={type} size="sm"
                        variant={isQuickRange(type) ? 'default' : 'outline'}
                        onClick={() => setQuickDateRange(type)}>
                        {label}
                      </Button>
                    ))}
                  </div>
                </>
              )}

              <div className="h-6 w-px bg-border" aria-hidden />

              {/* 결제 상태 */}
              <div className="flex gap-1 flex-wrap">
                {[
                  { value: [] as string[], label: '전체' },
                  { value: ['pending'], label: '미납' },
                  { value: ['pending', 'partial'], label: '미완납' },
                  { value: ['completed'], label: '완납' },
                  { value: ['withdrawn'], label: '포기' },
                ].map((opt) => {
                  const isActive = JSON.stringify([...paymentStatusFilter].sort()) === JSON.stringify([...opt.value].sort());
                  return (
                    <Button key={opt.label} size="sm"
                      variant={isActive ? 'default' : 'outline'}
                      onClick={() => setPaymentStatusFilter(opt.value)}>
                      {opt.label}
                    </Button>
                  );
                })}
              </div>
            </div>

            <Button variant="outline" onClick={() => setIsExportModalVisible(true)}>
              <Download className="h-4 w-4" />내보내기
            </Button>
          </div>

          {/* 필터 요약 */}
          {(dateRange[0] || dateRange[1] || paymentStatusFilter.length > 0) && (
            <p className="text-muted-foreground text-[0.87rem]">
              {dateRange[0] && dateRange[1] && (
                <>
                  {dayjs(dateRange[0]).format('YYYY년 M월 D일')} ~ {dayjs(dateRange[1]).format('YYYY년 M월 D일')}
                </>
              )}
              {dateRange[0] && dateRange[1] && paymentStatusFilter.length > 0 && ' | '}
              {paymentStatusFilter.length > 0 && (
                <>
                  결제 상태:{' '}
                  {paymentStatusFilter
                    .map((s) => {
                      const map: Record<string, string> = {
                        pending: '미납',
                        partial: '부분납부',
                        completed: '완납',
                        withdrawn: '포기',
                        exempt: '면제',
                      };
                      return map[s];
                    })
                    .join(', ')}
                </>
              )}
              {' ( '}
              {filteredEnrollments.length}건 )
            </p>
          )}
        </CardContent>
      </Card>

      {/* 상단 통계 */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
        <RevenueBreakdownTooltip enrollments={revenueEnrollments} records={records}>
          <Card>
            <CardContent className="p-4">
              <p className="text-[0.73rem] font-semibold text-muted-foreground uppercase tracking-widest mb-1">총 수익</p>
              <p className="text-2xl font-bold tabular-nums text-success" style={{ letterSpacing: '-0.02em' }}>
                {totalRevenue.toLocaleString()}<span className="text-sm font-normal text-muted-foreground ml-0.5">원</span>
              </p>
            </CardContent>
          </Card>
        </RevenueBreakdownTooltip>
        <Card>
          <CardContent className="p-4">
            <p className="text-[0.73rem] font-semibold text-muted-foreground uppercase tracking-widest mb-1">예상 수익</p>
            <p className="text-2xl font-bold tabular-nums text-foreground" style={{ letterSpacing: '-0.02em' }}>
              {expectedRevenue.toLocaleString()}<span className="text-sm font-normal text-muted-foreground ml-0.5">원</span>
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[0.73rem] font-semibold text-muted-foreground uppercase tracking-widest mb-1">미수금</p>
            <p className="text-2xl font-bold tabular-nums text-error" style={{ letterSpacing: '-0.02em' }}>
              {totalUnpaid.toLocaleString()}<span className="text-sm font-normal text-muted-foreground ml-0.5">원</span>
            </p>
          </CardContent>
        </Card>
        <Card title="총수익 ÷ 예상수익 — 미환불이 있으면 100%를 넘을 수 있음">
          <CardContent className="p-4">
            <p className="text-[0.73rem] font-semibold text-muted-foreground uppercase tracking-widest mb-1">수익률</p>
            <p className="text-2xl font-bold tabular-nums text-foreground" style={{ letterSpacing: '-0.02em' }}>
              {(expectedRevenue > 0 ? (totalRevenue / expectedRevenue) * 100 : 0).toFixed(1)}<span className="text-sm font-normal text-muted-foreground ml-0.5">%</span>
            </p>
          </CardContent>
        </Card>
        <Card title="미수금 ÷ 예상수익 — 수강 중 학생 기준">
          <CardContent className="p-4">
            <p className="text-[0.73rem] font-semibold text-muted-foreground uppercase tracking-widest mb-1">미납률</p>
            <p className={`text-2xl font-bold tabular-nums ${totalUnpaid > 0 ? 'text-error' : 'text-success'}`} style={{ letterSpacing: '-0.02em' }}>
              {(expectedRevenue > 0 ? (totalUnpaid / expectedRevenue) * 100 : 0).toFixed(1)}<span className="text-sm font-normal text-muted-foreground ml-0.5">%</span>
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-[0.73rem] font-semibold text-muted-foreground uppercase tracking-widest mb-1">완납</p>
            <p className="text-3xl font-bold tabular-nums text-success" style={{ letterSpacing: '-0.02em' }}>
              {completedPayments}<span className="text-sm font-normal text-muted-foreground ml-0.5">건</span>
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[0.73rem] font-semibold text-muted-foreground uppercase tracking-widest mb-1">부분납부</p>
            <p className="text-3xl font-bold tabular-nums text-warning" style={{ letterSpacing: '-0.02em' }}>
              {partialPayments}<span className="text-sm font-normal text-muted-foreground ml-0.5">건</span>
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[0.73rem] font-semibold text-muted-foreground uppercase tracking-widest mb-1">미납</p>
            <p className="text-3xl font-bold tabular-nums text-error" style={{ letterSpacing: '-0.02em' }}>
              {pendingPayments}<span className="text-sm font-normal text-muted-foreground ml-0.5">건</span>
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[0.73rem] font-semibold text-muted-foreground uppercase tracking-widest mb-1">면제</p>
            <p className="text-3xl font-bold tabular-nums text-foreground" style={{ letterSpacing: '-0.02em', color: EXEMPT_COLOR }}>
              {exemptPayments}<span className="text-sm font-normal text-muted-foreground ml-0.5">건</span>
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[0.73rem] font-semibold text-muted-foreground uppercase tracking-widest mb-1">포기</p>
            <p className="text-3xl font-bold tabular-nums text-muted-foreground" style={{ letterSpacing: '-0.02em' }}>
              {withdrawnPayments}<span className="text-sm font-normal text-muted-foreground ml-0.5">건</span>
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="1">
        <TabsList>
          <TabsTrigger value="1">강좌별 수익</TabsTrigger>
          <TabsTrigger value="2">미납자 관리 ({unpaidList.length})</TabsTrigger>
          <TabsTrigger value="3">
            <Calendar className="h-4 w-4 mr-1" />
            분기별 수익 현황
          </TabsTrigger>
        </TabsList>

        <TabsContent value="1">
          <div className="rounded-xl overflow-hidden bg-card [box-shadow:var(--shadow-sm)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="h-10 px-3 text-left text-xs font-semibold text-muted-foreground tracking-wider uppercase">강좌명</th>
                  <th className="h-10 px-3 text-left text-xs font-semibold text-muted-foreground tracking-wider uppercase">수강생 수</th>
                  <th className="h-10 px-3 text-left text-xs font-semibold text-muted-foreground tracking-wider uppercase">수익</th>
                  <th className="h-10 px-3 text-left text-xs font-semibold text-muted-foreground tracking-wider uppercase">예상 수익</th>
                  <th className="h-10 px-3 text-left text-xs font-semibold text-muted-foreground tracking-wider uppercase">미수금</th>
                  <th className="h-10 px-3 text-left text-xs font-semibold text-muted-foreground tracking-wider uppercase">완납률</th>
                </tr>
              </thead>
              <tbody>
                {courseRevenueData.map((row) => (
                  <tr key={row.courseId} className="border-b hover:bg-muted/30">
                    <td className="px-3 py-3.5">
                      <button
                        type="button"
                        className="text-primary hover:underline text-left"
                        onClick={() => goToCourse(row.courseId)}
                      >
                        {row.courseName}
                      </button>
                    </td>
                    <td className="px-3 py-3.5">
                      <span className="tabular-nums">{row.studentCount}</span>
                      {row.withdrawnCount > 0 && (
                        <span className="text-muted-foreground ml-1.5 text-[0.82rem]" title="환불 없이 포기한 수강생 수">
                          (포기 {row.withdrawnCount})
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3.5">
                      <RevenueBreakdownTooltip enrollments={row.revenueEnrollments} records={row.courseRecords}>
                        <span className="tabular-nums">{'\u20A9'}{row.revenue.toLocaleString()}</span>
                      </RevenueBreakdownTooltip>
                    </td>
                    <td className="px-3 py-3.5">{'\u20A9'}{row.expected.toLocaleString()}</td>
                    <td className={`px-3 py-3.5 ${row.unpaid > 0 ? 'text-error' : 'text-success'}`}>
                      {'\u20A9'}{row.unpaid.toLocaleString()}
                    </td>
                    <td className="px-3 py-3.5">
                      <span className="tabular-nums">{row.completedCount}/{row.activeCount}</span>
                      <span className="text-muted-foreground ml-1.5 text-[0.86rem]">({row.completionRate.toFixed(0)}%)</span>
                    </td>
                  </tr>
                ))}
                {courseRevenueData.length === 0 && (
                  <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">데이터가 없습니다</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="2">
          <div className="rounded-xl overflow-auto bg-card [box-shadow:var(--shadow-sm)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="h-10 px-3 text-left text-xs font-semibold text-muted-foreground tracking-wider uppercase">수강생</th>
                  <th className="h-10 px-3 text-left text-xs font-semibold text-muted-foreground tracking-wider uppercase">전화번호</th>
                  <th className="h-10 px-3 text-left text-xs font-semibold text-muted-foreground tracking-wider uppercase">강좌</th>
                  <th className="h-10 px-3 text-left text-xs font-semibold text-muted-foreground tracking-wider uppercase">수강료</th>
                  <th className="h-10 px-3 text-left text-xs font-semibold text-muted-foreground tracking-wider uppercase">납부 상태</th>
                  <th className="h-10 px-3 text-left text-xs font-semibold text-muted-foreground tracking-wider uppercase">납부 금액</th>
                  <th className="h-10 px-3 text-left text-xs font-semibold text-muted-foreground tracking-wider uppercase">납부일</th>
                  <th className="h-10 px-3 text-left text-xs font-semibold text-muted-foreground tracking-wider uppercase">납부 방법</th>
                  <th className="h-10 px-3 text-left text-xs font-semibold text-muted-foreground tracking-wider uppercase">할인</th>
                  <th className="h-10 px-3 text-left text-xs font-semibold text-muted-foreground tracking-wider uppercase">잔여 금액</th>
                  <th className="h-10 px-3 text-left text-xs font-semibold text-muted-foreground tracking-wider uppercase">작업</th>
                </tr>
              </thead>
              <tbody>
                {unpaidList.map((row) => {
                  const s = statusMap[row.paymentStatus] || { label: row.paymentStatus, variant: 'secondary' as const };
                  return (
                    <tr key={row.id} className="border-b hover:bg-muted/30">
                      <td className="px-3 py-3.5">{row.studentName}</td>
                      <td className="px-3 py-3.5">{row.studentPhone}</td>
                      <td className="px-3 py-3.5">
                        <button
                          type="button"
                          className="text-primary hover:underline text-left"
                          onClick={() => goToCourse(row.courseId)}
                        >
                          {row.courseName}
                        </button>
                      </td>
                      <td className="px-3 py-3.5">{'\u20A9'}{row.courseFee.toLocaleString()}</td>
                      <td className="px-3 py-3.5"><Badge variant={s.variant}>{s.label}</Badge></td>
                      <td className="px-3 py-3.5">{'\u20A9'}{row.paidAmount.toLocaleString()}</td>
                      <td className="px-3 py-3.5">{row.paidAt || '-'}</td>
                      <td className="px-3 py-3.5">{row.paymentMethod ? PAYMENT_METHOD_LABELS[row.paymentMethod] : '-'}</td>
                      <td className="px-3 py-3.5">
                        {row.discountAmount > 0 ? (
                          <span className="text-success">-{'\u20A9'}{row.discountAmount.toLocaleString()}</span>
                        ) : '-'}
                      </td>
                      <td className="px-3 py-3.5">
                        <span className="text-error font-bold">{'\u20A9'}{row.remainingAmount.toLocaleString()}</span>
                      </td>
                      <td className="px-3 py-3.5">
                        <Button variant="link" size="sm" className="h-auto p-0" onClick={() => handlePaymentEdit(row)}>
                          납부 처리
                        </Button>
                      </td>
                    </tr>
                  );
                })}
                {unpaidList.length === 0 && (
                  <tr><td colSpan={11} className="px-3 py-8 text-center text-muted-foreground">미납자가 없습니다</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="3">
          <div className="flex items-center justify-end mb-4 flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <RevenueBreakdownTooltip enrollments={quarterRevenueData.flatMap((d) => d.revenueEnrollments)} records={quarterRevenueData.flatMap((d) => d.courseRecords)}>
                <div className="px-3 py-1.5 rounded-md border">
                  <div className="text-[0.73rem] font-semibold text-muted-foreground uppercase tracking-widest">분기 수익</div>
                  <div className="text-sm font-semibold mt-0.5 text-success">{'\u20A9'}{quarterTotalRevenue.toLocaleString()}</div>
                </div>
              </RevenueBreakdownTooltip>
              <div className="px-3 py-1.5 rounded-md border">
                <div className="text-[0.73rem] font-semibold text-muted-foreground uppercase tracking-widest">예상 합계</div>
                <div className="text-sm font-semibold mt-0.5">{'\u20A9'}{quarterTotalExpected.toLocaleString()}</div>
              </div>
              <div className="px-3 py-1.5 rounded-md border">
                <div className="text-[0.73rem] font-semibold text-muted-foreground uppercase tracking-widest">수납률</div>
                <div className={`text-sm font-semibold mt-0.5 ${quarterTotalExpected > 0 && quarterTotalRevenue < quarterTotalExpected ? 'text-error' : 'text-success'}`}>
                  {quarterTotalExpected > 0 ? Math.round((quarterTotalRevenue / quarterTotalExpected) * 100) : 0}%
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl overflow-hidden bg-card [box-shadow:var(--shadow-sm)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="h-10 px-3 text-left text-xs font-semibold text-muted-foreground tracking-wider uppercase">강좌명</th>
                  <th className="h-10 px-3 text-left text-xs font-semibold text-muted-foreground tracking-wider uppercase w-20">수강생</th>
                  <th className="h-10 px-3 text-left text-xs font-semibold text-muted-foreground tracking-wider uppercase w-[70px]">납부</th>
                  <th className="h-10 px-3 text-left text-xs font-semibold text-muted-foreground tracking-wider uppercase w-[70px]">미납</th>
                  <th className="h-10 px-3 text-left text-xs font-semibold text-muted-foreground tracking-wider uppercase">분기 수익</th>
                  <th className="h-10 px-3 text-left text-xs font-semibold text-muted-foreground tracking-wider uppercase">예상 수익</th>
                  <th className="h-10 px-3 text-left text-xs font-semibold text-muted-foreground tracking-wider uppercase">수납률</th>
                </tr>
              </thead>
              <tbody>
                {quarterRevenueData.map((row) => (
                  <tr key={row.courseId} className="border-b hover:bg-muted/30">
                    <td className="px-3 py-3.5">
                      <button
                        type="button"
                        className="text-primary hover:underline text-left"
                        onClick={() => goToCourse(row.courseId)}
                      >
                        {row.courseName}
                      </button>
                    </td>
                    <td className="px-3 py-3.5">
                      <span className="tabular-nums">{row.studentCount}</span>
                      {row.withdrawnCount > 0 && (
                        <span className="text-muted-foreground ml-1.5 text-[0.82rem]" title="환불 없이 포기한 수강생 수">
                          (포기 {row.withdrawnCount})
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3.5 text-success">{row.paidCount}명</td>
                    <td className={`px-3 py-3.5 ${row.unpaidCount > 0 ? 'text-error' : 'text-success'}`}>{row.unpaidCount}명</td>
                    <td className="px-3 py-3.5">
                      <RevenueBreakdownTooltip enrollments={row.revenueEnrollments} records={row.courseRecords}>
                        <span className="tabular-nums">{'\u20A9'}{row.quarterRevenue.toLocaleString()}</span>
                      </RevenueBreakdownTooltip>
                    </td>
                    <td className="px-3 py-3.5">{'\u20A9'}{row.quarterExpected.toLocaleString()}</td>
                    <td className={`px-3 py-3.5 ${row.collectionRate >= 100 ? 'text-success' : row.collectionRate >= 50 ? 'text-warning' : 'text-error'}`}>
                      {row.collectionRate.toFixed(1)}%
                    </td>
                  </tr>
                ))}
                {quarterRevenueData.length === 0 && (
                  <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">데이터가 없습니다</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>

      {selectedEnrollment && (
        <PaymentForm
          visible={isPaymentModalVisible}
          onClose={() => {
            setIsPaymentModalVisible(false);
            setSelectedEnrollment(null);
          }}
          enrollment={selectedEnrollment}
          courseFee={getCourseById(selectedEnrollment.courseId)?.fee || 0}
        />
      )}

      <Dialog open={isExportModalVisible} onOpenChange={setIsExportModalVisible}>
        <DialogContent className="max-w-[360px]">
          <DialogHeader>
            <DialogTitle>수익 현황 내보내기</DialogTitle>
            <DialogDescription className="sr-only">내보낼 필드를 선택하세요</DialogDescription>
          </DialogHeader>

          <div style={{ marginTop: 8 }}>
            <div className="flex justify-between items-center mb-3">
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                onClick={() => setSelectedExportFields(isAllRevenueSelected ? [] : allRevenueFieldKeys)}
              >
                {isAllRevenueSelected ? '선택 해제' : '전체 선택'}
              </button>
              <span className="text-xs text-muted-foreground">
                {selectedExportFields.length}개 선택
              </span>
            </div>

            <div className="flex flex-wrap gap-2 mb-6">
              {REVENUE_EXPORT_FIELDS.map((field) => {
                const isChecked = selectedExportFields.includes(field.key);
                return (
                  <button
                    key={field.key}
                    type="button"
                    onClick={() => {
                      setSelectedExportFields((prev) =>
                        isChecked ? prev.filter((k) => k !== field.key) : [...prev, field.key]
                      );
                    }}
                    className={`px-3 py-1.5 rounded-full text-[0.87rem] font-medium border transition-colors cursor-pointer ${
                      isChecked
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-transparent text-muted-foreground border-border hover:border-foreground/30'
                    }`}
                  >
                    {field.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              className="flex-1"
              onClick={() => handleExport('excel')}
              disabled={selectedExportFields.length === 0}
            >
              <FileSpreadsheet className="h-4 w-4" />
              Excel
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => handleExport('csv')}
              disabled={selectedExportFields.length === 0}
            >
              <FileText className="h-4 w-4" />
              CSV
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </PageEnter>
  );
};

export default RevenueManagementPage;
