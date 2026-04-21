import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Download, FileSpreadsheet, FileText, Calendar,
} from 'lucide-react';
import { toast } from 'sonner';
import dayjs from 'dayjs';
import {
  Button, Dialog, DialogContent, DialogHeader, DialogTitle,
  Card, CardContent, Badge,
  Tabs, TabsContent, TabsList, TabsTrigger,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
  Input, PageEnter,
} from '@tutomate/ui';
import { EXEMPT_COLOR } from '@tutomate/core';
import { useCourseStore } from '@tutomate/core';
import { useStudentStore } from '@tutomate/core';
import { useEnrollmentStore } from '@tutomate/core';
import { usePaymentRecordStore } from '@tutomate/core';
import { getCurrentQuarter, getQuarterOptions } from '@tutomate/core';
import { PaymentForm, StudentForm } from '@tutomate/ui';
import type { Enrollment, Student } from '@tutomate/core';
import { PAYMENT_METHOD_LABELS } from '@tutomate/core';
import { exportRevenueToExcel, exportRevenueToCSV, REVENUE_EXPORT_FIELDS } from '@tutomate/core';
import { RevenueBreakdownTooltip } from '@tutomate/ui';

const RevenueManagementPage: React.FC = () => {
  const navigate = useNavigate();
  const goToCourse = (courseId: string) =>
    navigate(`/courses/${courseId}?q=${encodeURIComponent(selectedQuarter)}`);
  const { courses, loadCourses, getCourseById } = useCourseStore();
  const { students, loadStudents, getStudentById } = useStudentStore();
  const { enrollments, loadEnrollments } = useEnrollmentStore();
  const { loadRecords, records } = usePaymentRecordStore();

  const [selectedEnrollment, setSelectedEnrollment] = useState<Enrollment | null>(null);
  const [isPaymentModalVisible, setIsPaymentModalVisible] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [isExportModalVisible, setIsExportModalVisible] = useState(false);
  const [selectedExportFields, setSelectedExportFields] = useState<string[]>(['courseName', 'studentName', 'fee', 'paidAmount', 'remainingAmount', 'paymentStatus']);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [dateRange, setDateRange] = useState<[string, string]>(['', '']);
  // 기간 필터 모드: 'quarter' | 'date' — 상호 배타
  const [filterMode, setFilterMode] = useState<'quarter' | 'date'>('quarter');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string[]>([]);

  const [selectedQuarter, setSelectedQuarter] = useState<string>(getCurrentQuarter());

  useEffect(() => {
    loadCourses();
    loadStudents();
    loadEnrollments();
    loadRecords();
  }, [loadCourses, loadStudents, loadEnrollments, loadRecords]);

  // Filter enrollments — filterMode에 따라 분기 OR 날짜 중 하나만 적용 (상호 배타)
  const filteredEnrollments = useMemo(() => {
    // withdrawn 포함 — 환불 금액이 수익에 반영되어야 함
    let filtered: typeof enrollments;

    if (filterMode === 'quarter') {
      filtered = enrollments.filter((e) => (e.quarter === selectedQuarter || !e.quarter));
    } else {
      // 날짜 모드: quarter 무시, dateRange만 적용
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

  // 할인 반영된 실제 수강료
  const getEffectiveFee = (e: Enrollment) => {
    const fee = getCourseById(e.courseId)?.fee ?? 0;
    return Math.max(0, fee - (e.discountAmount ?? 0));
  };

  // 수익 집계 대상: exempt 제외
  const revenueEnrollments = useMemo(() => filteredEnrollments.filter((e) => e.paymentStatus !== 'exempt'), [filteredEnrollments]);
  // 활성(active) = 수익 집계 대상 중 withdrawn 제외 → 예상수익/미수금 계산용
  const activeRevenue = useMemo(() => revenueEnrollments.filter((e) => e.paymentStatus !== 'withdrawn'), [revenueEnrollments]);

  // 총수익: active의 paidAmount + withdrawn의 net paidAmount(환불 차감 후)
  const totalRevenue = revenueEnrollments.reduce((sum, e) => sum + e.paidAmount, 0);
  // 예상수익: active만, 할인 반영
  const expectedRevenue = activeRevenue.reduce((sum, e) => sum + getEffectiveFee(e), 0);
  // 미수금: active 학생 기준만 (withdrawn은 미수가 아님). 음수 방지
  const activeRevenueTotal = activeRevenue.reduce((sum, e) => sum + e.paidAmount, 0);
  const totalUnpaid = Math.max(0, expectedRevenue - activeRevenueTotal);

  // 결제수단별 통계: 환불(음수)도 그대로 합산되어 net 표시
  const totalCash = revenueEnrollments.filter((e) => e.paymentMethod === 'cash').reduce((sum, e) => sum + e.paidAmount, 0);
  const totalTransfer = revenueEnrollments.filter((e) => e.paymentMethod === 'transfer').reduce((sum, e) => sum + e.paidAmount, 0);
  const totalCard = revenueEnrollments.filter((e) => e.paymentMethod === 'card').reduce((sum, e) => sum + e.paidAmount, 0);

  // 상태별 건수
  const completedPayments = filteredEnrollments.filter((e) => e.paymentStatus === 'completed').length;
  const partialPayments = filteredEnrollments.filter((e) => e.paymentStatus === 'partial').length;
  const pendingPayments = filteredEnrollments.filter((e) => e.paymentStatus === 'pending').length;
  const exemptPayments = filteredEnrollments.filter((e) => e.paymentStatus === 'exempt').length;
  const withdrawnPayments = filteredEnrollments.filter((e) => e.paymentStatus === 'withdrawn').length;

  const courseRevenueData = useMemo(() => courses.map((course) => {
    const courseEnrollments = filteredEnrollments.filter((e) => e.courseId === course.id);
    const nonExemptEnrollments = courseEnrollments.filter((e) => e.paymentStatus !== 'exempt');
    // active = withdrawn 제외 (예상수익/미수금 계산용)
    const activeEnrollments = nonExemptEnrollments.filter((e) => e.paymentStatus !== 'withdrawn');
    // 수익: 환불 net 포함
    const revenue = nonExemptEnrollments.reduce((sum, e) => sum + e.paidAmount, 0);
    // 예상수익: active의 effectiveFee (할인 반영)
    const expected = activeEnrollments.reduce(
      (sum, e) => sum + Math.max(0, course.fee - (e.discountAmount ?? 0)),
      0,
    );
    const activeRevenueLocal = activeEnrollments.reduce((sum, e) => sum + e.paidAmount, 0);
    const unpaid = Math.max(0, expected - activeRevenueLocal);
    const completed = courseEnrollments.filter((e) => e.paymentStatus === 'completed').length;
    // 활성 수강생 수 기준 완납률 (withdrawn/exempt 제외)
    const completionRate = activeEnrollments.length > 0 ? (completed / activeEnrollments.length) * 100 : 0;

    const withdrawnCount = courseEnrollments.filter((e) => e.paymentStatus === 'withdrawn').length;
    // 환불 총액 (payment_records 중 amount<0 합의 절대값)
    const enrollmentIds = new Set(courseEnrollments.map((e) => e.id));
    const courseRecords = records.filter((r) => enrollmentIds.has(r.enrollmentId));
    const refundTotal = Math.abs(courseRecords.filter((r) => r.amount < 0).reduce((sum, r) => sum + r.amount, 0));
    const grossTotal = courseRecords.filter((r) => r.amount > 0).reduce((sum, r) => sum + r.amount, 0);
    // 미환불: 환불 없이 포기한 학생이 낸 잔여 금액
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
      grossTotal,
      refundTotal,
      withdrawnKept,
      expected,
      unpaid,
      completionRate,
      completedCount: completed,
      activeCount: activeEnrollments.length,
      revenueEnrollments: nonExemptEnrollments, // 툴팁용
      courseRecords, // 툴팁용
    };
  }), [courses, filteredEnrollments, records]);

  const unpaidList = useMemo(() => filteredEnrollments
    .filter((e) => e.paymentStatus === 'pending' || e.paymentStatus === 'partial')
    .map((enrollment) => {
      const student = getStudentById(enrollment.studentId);
      const course = getCourseById(enrollment.courseId);
      return {
        ...enrollment,
        studentName: student?.name || '-',
        studentPhone: student?.phone || '-',
        courseName: course?.name || '-',
        courseFee: course?.fee || 0,
        paymentMethod: enrollment.paymentMethod,
        discountAmount: enrollment.discountAmount ?? 0,
      };
    }), [filteredEnrollments, getStudentById, getCourseById]);

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
      // 수납률은 active 기준 (withdrawn은 분모/분자 모두에서 제외)
      const collectionRate = quarterExpected > 0 ? (activeRevenueLocal / quarterExpected) * 100 : 0;

      const withdrawnCount = quarterAll.filter((e) => e.paymentStatus === 'withdrawn').length;
      // 환불 총액
      const enrollmentIds = new Set(quarterAll.map((e) => e.id));
      const courseRecords = records.filter((r) => enrollmentIds.has(r.enrollmentId));
      const refundTotal = Math.abs(courseRecords.filter((r) => r.amount < 0).reduce((sum, r) => sum + r.amount, 0));
      const grossTotal = courseRecords.filter((r) => r.amount > 0).reduce((sum, r) => sum + r.amount, 0);
      const withdrawnKept = quarterAll
        .filter((e) => e.paymentStatus === 'withdrawn')
        .reduce((sum, e) => sum + e.paidAmount, 0);
      return {
        courseId: course.id,
        courseName: course.name,
        studentCount: active.length, // 활성 수강생 수 (withdrawn 제외)
        withdrawnCount,
        paidCount,
        unpaidCount,
        quarterRevenue,
        quarterExpected,
        grossTotal,
        refundTotal,
        withdrawnKept,
        collectionRate,
        revenueEnrollments: nonExempt, // 툴팁용
        courseRecords, // 툴팁용
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
        setDateRange([dayjs().subtract(1, 'month').startOf('month').format('YYYY-MM-DD'), dayjs().subtract(1, 'month').endOf('month').format('YYYY-MM-DD')]);
        break;
      case 'this-year':
        setDateRange([dayjs().startOf('year').format('YYYY-MM-DD'), dayjs().endOf('year').format('YYYY-MM-DD')]);
        break;
      case 'all':
        setDateRange(['', '']);
        break;
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

  const statusMap: Record<string, { variant: 'error' | 'warning' | 'success' | 'secondary'; text: string }> = {
    pending: { variant: 'error', text: '미납' },
    partial: { variant: 'warning', text: '부분납부' },
    completed: { variant: 'success', text: '완납' },
    exempt: { variant: 'secondary', text: '면제' },
  };

  const isDateRangeActive = (type: string) => {
    if (type === 'all') return !dateRange[0] && !dateRange[1];
    if (type === 'this-month') return dateRange[0] === dayjs().startOf('month').format('YYYY-MM-DD') && dateRange[1] === dayjs().endOf('month').format('YYYY-MM-DD');
    if (type === 'last-month') return dateRange[0] === dayjs().subtract(1, 'month').startOf('month').format('YYYY-MM-DD') && dateRange[1] === dayjs().subtract(1, 'month').endOf('month').format('YYYY-MM-DD');
    if (type === 'this-year') return dateRange[0] === dayjs().startOf('year').format('YYYY-MM-DD') && dateRange[1] === dayjs().endOf('year').format('YYYY-MM-DD');
    return false;
  };

  return (
    <PageEnter>
      {/* 필터 섹션 — 한 줄 통합: [기간 모드+값] | [결제상태] | [내보내기] */}
      <Card className="mb-6">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-3 flex-wrap justify-between">
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

              {/* 모드별 필터 값 */}
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
                  <Button variant="outline" size="sm" onClick={() => setSelectedQuarter(getCurrentQuarter())}>이번 분기</Button>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-1.5">
                    <Input type="date" value={dateRange[0]}
                      onChange={(e) => setDateRange([e.target.value, dateRange[1]])}
                      className="w-[140px] h-9 text-sm" />
                    <span className="text-muted-foreground">~</span>
                    <Input type="date" value={dateRange[1]}
                      onChange={(e) => setDateRange([dateRange[0], e.target.value])}
                      className="w-[140px] h-9 text-sm" />
                  </div>
                  <div className="flex gap-1">
                    {[
                      { label: '이번 달', type: 'this-month' as const },
                      { label: '지난 달', type: 'last-month' as const },
                      { label: '올해', type: 'this-year' as const },
                    ].map((btn) => (
                      <Button key={btn.type}
                        variant={isDateRangeActive(btn.type) ? 'default' : 'outline'}
                        size="sm" onClick={() => setQuickDateRange(btn.type)}>
                        {btn.label}
                      </Button>
                    ))}
                  </div>
                </>
              )}

              {/* 세로 구분선 */}
              <div className="h-6 w-px bg-border" aria-hidden />

              {/* 결제 상태 */}
              <div className="flex gap-1">
                {[
                  { label: '전체', value: [] as string[] },
                  { label: '미납', value: ['pending'] },
                  { label: '미완납', value: ['pending', 'partial'] },
                  { label: '완납', value: ['completed'] },
                  { label: '포기', value: ['withdrawn'] },
                ].map((opt) => {
                  const active = JSON.stringify([...paymentStatusFilter].sort()) === JSON.stringify([...opt.value].sort());
                  return (
                    <Button key={opt.label} size="sm"
                      variant={active ? 'default' : 'outline'}
                      onClick={() => setPaymentStatusFilter(opt.value)}>
                      {opt.label}
                    </Button>
                  );
                })}
              </div>
            </div>

            <Button variant="outline" size="sm" onClick={() => setIsExportModalVisible(true)}>
              <Download className="h-4 w-4" />내보내기
            </Button>
          </div>

          {/* 필터 요약 */}
          {(dateRange[0] || dateRange[1] || paymentStatusFilter.length > 0) && (
            <p className="text-sm text-muted-foreground">
              {dateRange[0] && dateRange[1] && (
                <>{dayjs(dateRange[0]).format('YYYY년 M월 D일')} ~ {dayjs(dateRange[1]).format('YYYY년 M월 D일')}</>
              )}
              {dateRange[0] && dateRange[1] && paymentStatusFilter.length > 0 && ' | '}
              {paymentStatusFilter.length > 0 && (
                <>
                  결제 상태:{' '}
                  {paymentStatusFilter.map((s) => {
                    const map: Record<string, string> = { pending: '미납', partial: '부분납부', completed: '완납', withdrawn: '포기', exempt: '면제' };
                    return map[s];
                  }).join(', ')}
                </>
              )}
              {' ( '}{filteredEnrollments.length}건 )
            </p>
          )}
        </CardContent>
      </Card>

      {/* 수익 통계 — 1줄: 금액 */}
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-3 mb-3">
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
        <Card>
          <CardContent className="p-4">
            <p className="text-[0.73rem] font-semibold text-muted-foreground uppercase tracking-widest mb-1">현금</p>
            <p className="text-2xl font-bold tabular-nums text-foreground" style={{ letterSpacing: '-0.02em' }}>
              {totalCash.toLocaleString()}<span className="text-sm font-normal text-muted-foreground ml-0.5">원</span>
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[0.73rem] font-semibold text-muted-foreground uppercase tracking-widest mb-1">계좌이체</p>
            <p className="text-2xl font-bold tabular-nums text-foreground" style={{ letterSpacing: '-0.02em' }}>
              {totalTransfer.toLocaleString()}<span className="text-sm font-normal text-muted-foreground ml-0.5">원</span>
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[0.73rem] font-semibold text-muted-foreground uppercase tracking-widest mb-1">카드</p>
            <p className="text-2xl font-bold tabular-nums text-foreground" style={{ letterSpacing: '-0.02em' }}>
              {totalCard.toLocaleString()}<span className="text-sm font-normal text-muted-foreground ml-0.5">원</span>
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 수익 통계 — 2줄: 상태 */}
      <div className="grid grid-cols-7 gap-3 mb-4">
        <Card title="총수익 ÷ 예상수익 — 미환불이 있으면 100%를 넘을 수 있음">
          <CardContent className="p-4">
            <p className="text-[0.73rem] font-semibold text-muted-foreground uppercase tracking-widest mb-1">수익률</p>
            <p className="text-2xl font-bold tabular-nums text-foreground" style={{ letterSpacing: '-0.02em' }}>
              {expectedRevenue > 0 ? ((totalRevenue / expectedRevenue) * 100).toFixed(1) : '0.0'}<span className="text-sm font-normal text-muted-foreground ml-0.5">%</span>
            </p>
          </CardContent>
        </Card>
        <Card title="미수금 ÷ 예상수익 — 수강 중 학생 기준">
          <CardContent className="p-4">
            <p className="text-[0.73rem] font-semibold text-muted-foreground uppercase tracking-widest mb-1">미납률</p>
            <p className={`text-2xl font-bold tabular-nums ${totalUnpaid > 0 ? 'text-error' : 'text-success'}`} style={{ letterSpacing: '-0.02em' }}>
              {expectedRevenue > 0 ? ((totalUnpaid / expectedRevenue) * 100).toFixed(1) : '0.0'}<span className="text-sm font-normal text-muted-foreground ml-0.5">%</span>
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[0.73rem] font-semibold text-muted-foreground uppercase tracking-widest mb-1">완납</p>
            <p className="text-2xl font-bold tabular-nums text-success" style={{ letterSpacing: '-0.02em' }}>
              {completedPayments}<span className="text-sm font-normal text-muted-foreground ml-0.5">건</span>
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[0.73rem] font-semibold text-muted-foreground uppercase tracking-widest mb-1">부분납부</p>
            <p className="text-2xl font-bold tabular-nums text-warning" style={{ letterSpacing: '-0.02em' }}>
              {partialPayments}<span className="text-sm font-normal text-muted-foreground ml-0.5">건</span>
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[0.73rem] font-semibold text-muted-foreground uppercase tracking-widest mb-1">미납</p>
            <p className="text-2xl font-bold tabular-nums text-error" style={{ letterSpacing: '-0.02em' }}>
              {pendingPayments}<span className="text-sm font-normal text-muted-foreground ml-0.5">건</span>
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[0.73rem] font-semibold text-muted-foreground uppercase tracking-widest mb-1">면제</p>
            <p className="text-2xl font-bold tabular-nums text-foreground" style={{ letterSpacing: '-0.02em', color: EXEMPT_COLOR }}>
              {exemptPayments}<span className="text-sm font-normal text-muted-foreground ml-0.5">건</span>
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[0.73rem] font-semibold text-muted-foreground uppercase tracking-widest mb-1">포기</p>
            <p className="text-2xl font-bold tabular-nums text-muted-foreground" style={{ letterSpacing: '-0.02em' }}>
              {withdrawnPayments}<span className="text-sm font-normal text-muted-foreground ml-0.5">건</span>
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="monthly">
        <TabsList>
          <TabsTrigger value="monthly" className="flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5" /> 분기별 수익 현황
          </TabsTrigger>
          <TabsTrigger value="course-revenue">강좌별 수익</TabsTrigger>
          <TabsTrigger value="unpaid">미납자 관리 ({unpaidList.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="course-revenue">
          <div className="rounded-xl overflow-hidden bg-card [box-shadow:var(--shadow-sm)]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>강좌명</TableHead>
                  <TableHead>수강생 수</TableHead>
                  <TableHead>수익</TableHead>
                  <TableHead>예상 수익</TableHead>
                  <TableHead>미수금</TableHead>
                  <TableHead>완납률</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {courseRevenueData.map((row) => (
                  <TableRow key={row.courseId}>
                    <TableCell>
                      <button
                        type="button"
                        className="text-primary hover:underline text-left"
                        onClick={() => goToCourse(row.courseId)}
                      >
                        {row.courseName}
                      </button>
                    </TableCell>
                    <TableCell>
                      <span className="tabular-nums">{row.studentCount}</span>
                      {row.withdrawnCount > 0 && (
                        <span className="text-muted-foreground ml-1.5 text-[0.82rem]" title="환불 없이 포기한 수강생 수">
                          (포기 {row.withdrawnCount})
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <RevenueBreakdownTooltip enrollments={row.revenueEnrollments} records={row.courseRecords}>
                        <span className="tabular-nums">{'\u20A9'}{row.revenue.toLocaleString()}</span>
                      </RevenueBreakdownTooltip>
                    </TableCell>
                    <TableCell>{'\u20A9'}{row.expected.toLocaleString()}</TableCell>
                    <TableCell className={row.unpaid > 0 ? 'text-error' : 'text-success'}>
                      {'\u20A9'}{row.unpaid.toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <span className="tabular-nums">{row.completedCount}/{row.activeCount}</span>
                      <span className="text-muted-foreground ml-1.5 text-[0.86rem]">({row.completionRate.toFixed(0)}%)</span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="unpaid">
          <div className="rounded-xl overflow-hidden bg-card [box-shadow:var(--shadow-sm)]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>수강생</TableHead>
                  <TableHead>전화번호</TableHead>
                  <TableHead>강좌</TableHead>
                  <TableHead>수강료</TableHead>
                  <TableHead>납부 상태</TableHead>
                  <TableHead>납부 금액</TableHead>
                  <TableHead>납부일</TableHead>
                  <TableHead>납부 방법</TableHead>
                  <TableHead>할인</TableHead>
                  <TableHead>잔여 금액</TableHead>
                  <TableHead>작업</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {unpaidList.map((row) => {
                  const s = statusMap[row.paymentStatus];
                  return (
                    <TableRow key={row.id}>
                      <TableCell>
                        <button
                          type="button"
                          className="text-primary hover:underline text-left"
                          onClick={() => {
                            const stu = students.find((s) => s.id === row.studentId);
                            if (stu) setSelectedStudent(stu);
                          }}
                        >
                          {row.studentName}
                        </button>
                      </TableCell>
                      <TableCell>{row.studentPhone}</TableCell>
                      <TableCell>
                        <button
                          type="button"
                          className="text-primary hover:underline text-left"
                          onClick={() => goToCourse(row.courseId)}
                        >
                          {row.courseName}
                        </button>
                      </TableCell>
                      <TableCell>{'\u20A9'}{row.courseFee.toLocaleString()}</TableCell>
                      <TableCell>
                        <Badge variant={s?.variant}>{s?.text}</Badge>
                      </TableCell>
                      <TableCell>{'\u20A9'}{row.paidAmount.toLocaleString()}</TableCell>
                      <TableCell>{row.paidAt || '-'}</TableCell>
                      <TableCell>
                        {row.paymentMethod ? PAYMENT_METHOD_LABELS[row.paymentMethod as keyof typeof PAYMENT_METHOD_LABELS] : '-'}
                      </TableCell>
                      <TableCell>
                        {row.discountAmount > 0
                          ? <span className="text-success">-{'\u20A9'}{row.discountAmount.toLocaleString()}</span>
                          : '-'}
                      </TableCell>
                      <TableCell className="text-error font-bold">
                        {'\u20A9'}{row.remainingAmount.toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Button variant="link" size="sm" className="p-0 h-auto" onClick={() => handlePaymentEdit(row)}>
                          납부 처리
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="monthly">
          <div className="flex items-center justify-end mb-4">
            <div className="flex items-center gap-6 text-sm">
              <div>
                <span className="text-muted-foreground">분기 수익: </span>
                <RevenueBreakdownTooltip enrollments={quarterRevenueData.flatMap((d) => d.revenueEnrollments)} records={quarterRevenueData.flatMap((d) => d.courseRecords)}>
                  <span className="font-semibold text-success">{'\u20A9'}{quarterTotalRevenue.toLocaleString()}</span>
                </RevenueBreakdownTooltip>
              </div>
              <div>
                <span className="text-muted-foreground">예상: </span>
                <span className="font-semibold">{'\u20A9'}{quarterTotalExpected.toLocaleString()}</span>
              </div>
              <div>
                <span className="text-muted-foreground">수납률: </span>
                <span className={`font-semibold ${quarterTotalExpected > 0 && quarterTotalRevenue < quarterTotalExpected ? 'text-error' : 'text-success'}`}>
                  {quarterTotalExpected > 0 ? Math.round((quarterTotalRevenue / quarterTotalExpected) * 100) : 0}%
                </span>
              </div>
            </div>
          </div>
          <div className="rounded-xl overflow-hidden bg-card [box-shadow:var(--shadow-sm)]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>강좌명</TableHead>
                  <TableHead>수강생</TableHead>
                  <TableHead>납부</TableHead>
                  <TableHead>미납</TableHead>
                  <TableHead>분기 수익</TableHead>
                  <TableHead>예상 수익</TableHead>
                  <TableHead>수납률</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {quarterRevenueData.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <Calendar className="h-8 w-8 opacity-40" />
                        <p className="font-medium text-foreground">해당 분기에 수강 데이터가 없습니다</p>
                        <p className="text-sm">다른 분기를 선택하거나 수강 신청을 등록해보세요</p>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
                {quarterRevenueData.map((row) => (
                  <TableRow key={row.courseId}>
                    <TableCell>
                      <button
                        type="button"
                        className="text-primary hover:underline text-left"
                        onClick={() => goToCourse(row.courseId)}
                      >
                        {row.courseName}
                      </button>
                    </TableCell>
                    <TableCell>
                      <span className="tabular-nums">{row.studentCount}</span>
                      {row.withdrawnCount > 0 && (
                        <span className="text-muted-foreground ml-1.5 text-[0.82rem]" title="환불 없이 포기한 수강생 수">
                          (포기 {row.withdrawnCount})
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-success">{row.paidCount}명</TableCell>
                    <TableCell className={row.unpaidCount > 0 ? 'text-error' : 'text-success'}>
                      {row.unpaidCount}명
                    </TableCell>
                    <TableCell>
                      <RevenueBreakdownTooltip enrollments={row.revenueEnrollments} records={row.courseRecords}>
                        <span className="tabular-nums">{'\u20A9'}{row.quarterRevenue.toLocaleString()}</span>
                      </RevenueBreakdownTooltip>
                    </TableCell>
                    <TableCell>{'\u20A9'}{row.quarterExpected.toLocaleString()}</TableCell>
                    <TableCell className={row.collectionRate >= 100 ? 'text-success' : row.collectionRate >= 50 ? 'text-warning' : 'text-error'}>
                      {row.collectionRate.toFixed(1)}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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

      <StudentForm
        visible={!!selectedStudent}
        onClose={() => setSelectedStudent(null)}
        student={selectedStudent}
        hideDelete
      />


      {/* 내보내기 모달 */}
      <Dialog open={isExportModalVisible} onOpenChange={setIsExportModalVisible}>
        <DialogContent className="max-w-[680px]">
          <DialogHeader>
            <DialogTitle>수익 현황 내보내기</DialogTitle>
          </DialogHeader>

          <div style={{ marginTop: 8 }}>
            <div className="flex justify-between items-center mb-3">
              <button type="button" className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                onClick={() => setSelectedExportFields(isAllRevenueSelected ? [] : allRevenueFieldKeys)}>
                {isAllRevenueSelected ? '선택 해제' : '전체 선택'}
              </button>
              <span className="text-xs text-muted-foreground">{selectedExportFields.length}개 선택 · 드래그로 순서 변경</span>
            </div>

            <div className="flex flex-wrap gap-2 mb-4">
              {REVENUE_EXPORT_FIELDS.map((field) => {
                const isChecked = selectedExportFields.includes(field.key);
                return (
                  <button key={field.key} type="button"
                    onClick={() => setSelectedExportFields((prev) => isChecked ? prev.filter((k) => k !== field.key) : [...prev, field.key])}
                    className={`px-3 py-1.5 rounded-full text-[0.87rem] font-medium border transition-colors cursor-pointer ${
                      isChecked ? 'bg-primary text-primary-foreground border-primary' : 'bg-transparent text-muted-foreground border-border hover:border-foreground/30'
                    }`}>
                    {field.label}
                  </button>
                );
              })}
            </div>

            {selectedExportFields.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-4 p-3 rounded-lg bg-muted/30 border border-dashed border-border">
                {selectedExportFields.map((key, idx) => {
                  const field = REVENUE_EXPORT_FIELDS.find((f) => f.key === key);
                  if (!field) return null;
                  const isDragging = dragIdx === idx;
                  const showLeftBar = dragOverIdx === idx && dragIdx !== null && dragIdx > idx;
                  const showRightBar = dragOverIdx === idx && dragIdx !== null && dragIdx < idx;
                  return (
                    <span key={key} draggable
                      onDragStart={(e) => { e.dataTransfer.setData('text/plain', String(idx)); setDragIdx(idx); }}
                      onDragOver={(e) => { e.preventDefault(); if (dragOverIdx !== idx) setDragOverIdx(idx); }}
                      onDrop={(e) => { e.preventDefault(); const fromIdx = Number(e.dataTransfer.getData('text/plain')); setDragIdx(null); setDragOverIdx(null); if (fromIdx === idx) return; setSelectedExportFields((prev) => { const next = [...prev]; const [moved] = next.splice(fromIdx, 1); next.splice(idx, 0, moved); return next; }); }}
                      onDragEnd={() => { setDragIdx(null); setDragOverIdx(null); }}
                      className={`relative px-2.5 py-1 rounded-md text-xs font-medium border cursor-grab active:cursor-grabbing select-none transition-opacity duration-150 ${isDragging ? 'opacity-20' : 'bg-background'}`}>
                      {showLeftBar && <span className="absolute -left-1.5 top-0 bottom-0 w-0.5 bg-primary rounded-full" />}
                      {field.label}
                      {showRightBar && <span className="absolute -right-1.5 top-0 bottom-0 w-0.5 bg-primary rounded-full" />}
                    </span>
                  );
                })}
              </div>
            )}

            {selectedExportFields.length > 0 && filteredEnrollments.length > 0 && (
              <div className="rounded-lg border overflow-hidden mb-4">
                <div className="text-[0.73rem] font-semibold text-muted-foreground uppercase tracking-wide px-3 py-2 bg-muted/30">미리보기</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="border-b bg-muted/20">
                      {selectedExportFields.map((key) => { const f = REVENUE_EXPORT_FIELDS.find((x) => x.key === key); return <th key={key} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">{f?.label}</th>; })}
                    </tr></thead>
                    <tbody>
                      {filteredEnrollments.slice(0, 3).map((enrollment) => (
                        <tr key={enrollment.id} className="border-b last:border-0">
                          {selectedExportFields.map((key) => { const f = REVENUE_EXPORT_FIELDS.find((x) => x.key === key); const val = f ? f.getValue(enrollment, students, courses) : ''; return <td key={key} className="px-3 py-2 whitespace-nowrap truncate max-w-[150px]">{val || '-'}</td>; })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => handleExport('excel')} disabled={selectedExportFields.length === 0}>
              <FileSpreadsheet className="h-4 w-4" />Excel
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => handleExport('csv')} disabled={selectedExportFields.length === 0}>
              <FileText className="h-4 w-4" />CSV
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </PageEnter>
  );
};

export default RevenueManagementPage;
