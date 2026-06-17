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
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
  CourseCombobox,
  PageEnter,
} from '@tutomate/ui';
import { useCourseStore } from '@tutomate/core';
import { useStudentStore } from '@tutomate/core';
import { useEnrollmentStore } from '@tutomate/core';
import { usePaymentRecordStore } from '@tutomate/core';
import { useQuarterStore, getQuarterLabel } from '@tutomate/core';
import { PaymentForm, StudentForm } from '@tutomate/ui';
import type { Enrollment, Student } from '@tutomate/core';
import { PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS } from '@tutomate/core';
import type { PaymentStatusType, PaymentMethod } from '@tutomate/core';
import { exportRevenueToExcel, exportRevenueToCSV, REVENUE_EXPORT_FIELDS } from '@tutomate/core';
import { RevenueBreakdownTooltip, DatePicker } from '@tutomate/ui';

const RevenueManagementPage: React.FC = () => {
  const navigate = useNavigate();
  const goToCourse = (courseId: string) =>
    navigate(`/courses/${courseId}?q=${encodeURIComponent(selectedQuarter)}`);
  const { courses, loadCourses, getCourseById } = useCourseStore();
  const { students, loadStudents, getStudentById } = useStudentStore();
  const { enrollments, loadEnrollments, updateEnrollment } = useEnrollmentStore();
  const { loadRecords, records } = usePaymentRecordStore();

  const [selectedEnrollment, setSelectedEnrollment] = useState<Enrollment | null>(null);
  const [isPaymentModalVisible, setIsPaymentModalVisible] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [isExportModalVisible, setIsExportModalVisible] = useState(false);
  const [selectedExportFields, setSelectedExportFields] = useState<string[]>(['courseName', 'studentName', 'fee', 'paidAmount', 'remainingAmount', 'paymentStatus']);
  const [exportCourse, setExportCourse] = useState<string>('all');
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [dateRange, setDateRange] = useState<[string, string]>(['', '']);
  // 기간 필터 모드: 'quarter' | 'date' — 상호 배타
  const [filterMode, setFilterMode] = useState<'quarter' | 'date'>('quarter');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string[]>([]);
  const [statusModal, setStatusModal] = useState<PaymentStatusType | null>(null);
  const [methodModal, setMethodModal] = useState<PaymentMethod | 'unspecified' | null>(null);

  const selectedQuarter = useQuarterStore((s) => s.selectedQuarter);

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
  // 결제수단 미지정 납부액: 총수익 - 3개 수단 합 (paymentMethod가 비어있는 건)
  const totalUnspecified = totalRevenue - (totalCash + totalTransfer + totalCard);

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
    const exemptCount = courseEnrollments.filter((e) => e.paymentStatus === 'exempt').length;
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
      exemptCount,
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

  // 상태별 명단 모달 데이터
  const statusModalList = useMemo(() => {
    if (!statusModal) return [];
    return filteredEnrollments
      .filter((e) => e.paymentStatus === statusModal)
      .map((e) => {
        const student = getStudentById(e.studentId);
        const course = getCourseById(e.courseId);
        return {
          id: e.id,
          studentName: student?.name || '-',
          isMember: !!student?.isMember,
          courseName: course?.name || '-',
          paidAmount: e.paidAmount,
        };
      })
      .sort((a, b) => a.studentName.localeCompare(b.studentName, 'ko'));
  }, [statusModal, filteredEnrollments, getStudentById, getCourseById]);

  // 결제수단별 명단 모달 데이터 (미지정 = paymentMethod 비어있고 납부액 있는 건)
  const methodModalList = useMemo(() => {
    if (!methodModal) return [];
    const methods: PaymentMethod[] = ['cash', 'card', 'transfer'];
    return revenueEnrollments
      .filter((e) => {
        if (e.paidAmount === 0) return false;
        if (methodModal === 'unspecified') {
          return !e.paymentMethod || !methods.includes(e.paymentMethod);
        }
        return e.paymentMethod === methodModal;
      })
      .map((e) => {
        const student = getStudentById(e.studentId);
        const course = getCourseById(e.courseId);
        return {
          id: e.id,
          studentName: student?.name || '-',
          isMember: !!student?.isMember,
          courseName: course?.name || '-',
          paidAmount: e.paidAmount,
        };
      })
      .sort((a, b) => a.studentName.localeCompare(b.studentName, 'ko'));
  }, [methodModal, revenueEnrollments, getStudentById, getCourseById]);

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
      const exemptCount = quarterAll.filter((e) => e.paymentStatus === 'exempt').length;
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
        exemptCount,
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
    }).filter((d) => d.studentCount > 0 || d.withdrawnCount > 0 || d.exemptCount > 0);
  }, [courses, enrollments, selectedQuarter, records]);

  const handleAssignMethod = async (enrollmentId: string, method: PaymentMethod) => {
    const ok = await updateEnrollment(enrollmentId, { paymentMethod: method });
    if (ok) toast.success(`결제수단을 ${PAYMENT_METHOD_LABELS[method]}(으)로 지정했습니다`);
  };

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

  const exportEnrollments = useMemo(
    () => (exportCourse === 'all'
      ? filteredEnrollments
      : filteredEnrollments.filter((e) => e.courseId === exportCourse)),
    [filteredEnrollments, exportCourse],
  );

  const exportQuarterTag = useMemo(() => {
    const base = filterMode === 'quarter' ? selectedQuarter : '기간지정';
    if (exportCourse === 'all') return base;
    const courseName = courses.find((c) => c.id === exportCourse)?.name;
    return courseName ? `${base}_${courseName}` : base;
  }, [filterMode, selectedQuarter, exportCourse, courses]);

  const handleExport = (type: 'excel' | 'csv') => {
    if (selectedExportFields.length === 0) {
      toast.warning('내보낼 필드를 1개 이상 선택해주세요.');
      return;
    }
    if (exportEnrollments.length === 0) {
      toast.warning('내보낼 수익 데이터가 없습니다');
      return;
    }
    try {
      if (type === 'excel') {
        exportRevenueToExcel(exportEnrollments, students, courses, selectedExportFields, exportQuarterTag);
        toast.success('Excel 파일이 다운로드되었습니다');
      } else {
        exportRevenueToCSV(exportEnrollments, students, courses, 'utf-8', selectedExportFields, exportQuarterTag);
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

  // 강좌별 그룹 + 스티키 헤더로 명단 렌더 (이름·납부액, 미지정이면 지정버튼)
  type PaymentListItem = { id: string; studentName: string; isMember: boolean; courseName: string; paidAmount: number };
  const renderGroupedList = (list: PaymentListItem[], withAssign: boolean) => {
    const groupMap = new Map<string, PaymentListItem[]>();
    for (const r of list) {
      if (!groupMap.has(r.courseName)) groupMap.set(r.courseName, []);
      groupMap.get(r.courseName)!.push(r);
    }
    const groups = Array.from(groupMap.entries())
      .map(([courseName, items]) => ({ courseName, items, total: items.reduce((s, x) => s + x.paidAmount, 0) }))
      .sort((a, b) => a.courseName.localeCompare(b.courseName, 'ko'));
    return (
      <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <tbody>
            {groups.map((group) => (
              <React.Fragment key={group.courseName}>
                <tr>
                  <th colSpan={withAssign ? 3 : 2} className="sticky top-0 z-10 bg-muted px-4 py-2 text-left font-semibold border-b border-border">
                    {group.courseName}
                    <span className="ml-2 font-normal text-muted-foreground">{group.items.length}건 · {group.total.toLocaleString()}원</span>
                  </th>
                </tr>
                {group.items.map((r) => (
                  <tr key={r.id} className="border-b border-border/50">
                    <td className="px-4 py-2 font-medium whitespace-nowrap">
                      {r.studentName}
                      {r.isMember && <Badge variant="info" className="ml-1.5">회원</Badge>}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums whitespace-nowrap">{r.paidAmount.toLocaleString()}원</td>
                    {withAssign && (
                      <td className="px-4 py-2">
                        <div className="flex gap-2 justify-end">
                          {(['cash', 'transfer', 'card'] as PaymentMethod[]).map((method) => (
                            <Button
                              key={method}
                              variant="outline"
                              size="sm"
                              onClick={() => handleAssignMethod(r.id, method)}
                            >
                              {PAYMENT_METHOD_LABELS[method]}
                            </Button>
                          ))}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <PageEnter>
      {/* 필터 섹션 — 한 줄 통합: [기간 모드+값] | [결제상태] | [내보내기] */}
      <Card className="mb-2">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap justify-between">
            <div className="flex items-center gap-2 flex-wrap">
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
                <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/60 px-3 py-1.5 text-sm font-semibold text-foreground">
                  <Calendar className="h-4 w-4 text-primary" />
                  {getQuarterLabel(selectedQuarter)}
                </span>
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

      {/* 수익 통계 — 핵심 3개 (총수익·미수금은 금액이라 더 넓게) */}
      <div className="grid grid-cols-1 sm:grid-cols-[1.3fr_1.3fr_1fr] gap-2 mb-2">
        <RevenueBreakdownTooltip enrollments={revenueEnrollments} records={records}>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm font-semibold text-muted-foreground mb-2">총 수익</p>
              <p className="text-[2rem] leading-none font-bold tabular-nums whitespace-nowrap text-foreground" style={{ letterSpacing: '-0.03em' }}>
                {totalRevenue.toLocaleString()}<span className="text-base font-medium text-muted-foreground ml-1">원</span>
              </p>
              <p className="text-sm text-muted-foreground mt-2">예상 {expectedRevenue.toLocaleString()}원</p>
            </CardContent>
          </Card>
        </RevenueBreakdownTooltip>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm font-semibold text-muted-foreground mb-2">미수금</p>
            <p className="text-[2rem] leading-none font-bold tabular-nums whitespace-nowrap" style={{ letterSpacing: '-0.03em', color: totalUnpaid > 0 ? 'hsl(0 72% 45%)' : undefined }}>
              {totalUnpaid.toLocaleString()}<span className="text-base font-medium text-muted-foreground ml-1">원</span>
            </p>
            <p className="text-sm text-muted-foreground mt-2">미납률 {expectedRevenue > 0 ? ((totalUnpaid / expectedRevenue) * 100).toFixed(1) : '0.0'}%</p>
          </CardContent>
        </Card>
        <Card title="총수익 ÷ 예상수익 — 미환불이 있으면 100%를 넘을 수 있음">
          <CardContent className="p-4">
            <p className="text-sm font-semibold text-muted-foreground mb-2">수익률</p>
            <p className="text-[2rem] leading-none font-bold tabular-nums whitespace-nowrap text-foreground" style={{ letterSpacing: '-0.03em' }}>
              {expectedRevenue > 0 ? ((totalRevenue / expectedRevenue) * 100).toFixed(1) : '0.0'}<span className="text-base font-medium text-muted-foreground ml-1">%</span>
            </p>
            <p className="text-sm text-muted-foreground mt-2">목표 대비 납부 비율</p>
          </CardContent>
        </Card>
      </div>

      {/* 결제 수단 */}
      <Card className="mb-2">
        <CardContent className="flex items-stretch divide-x divide-border p-0">
          {[
            { label: '현금', value: totalCash, method: 'cash' as const },
            { label: '계좌이체', value: totalTransfer, method: 'transfer' as const },
            { label: '카드', value: totalCard, method: 'card' as const },
            ...(totalUnspecified !== 0 ? [{ label: '미지정', value: totalUnspecified, method: 'unspecified' as const }] : []),
          ].map((m) => (
            <button
              key={m.label}
              type="button"
              onClick={() => m.value !== 0 && setMethodModal(m.method)}
              disabled={m.value === 0}
              className="flex-1 px-6 py-4 text-left transition-colors hover:bg-accent disabled:cursor-default disabled:hover:bg-transparent"
            >
              <p className="text-sm font-semibold text-muted-foreground mb-1.5">{m.label}</p>
              <p className="text-xl font-bold tabular-nums text-foreground whitespace-nowrap">{m.value.toLocaleString()}<span className="text-sm font-medium text-muted-foreground ml-1">원</span></p>
            </button>
          ))}
        </CardContent>
      </Card>

      {/* 납부 상태 건수 */}
      <Card className="mb-2">
        <CardContent className="flex items-stretch divide-x divide-border p-0">
          {[
            { label: '완납', value: completedPayments, dot: 'hsl(142 64% 30%)', status: 'completed' as PaymentStatusType },
            { label: '부분납부', value: partialPayments, dot: 'hsl(33 90% 40%)', status: 'partial' as PaymentStatusType },
            { label: '미납', value: pendingPayments, dot: 'hsl(0 72% 45%)', status: 'pending' as PaymentStatusType },
            { label: '면제', value: exemptPayments, dot: 'hsl(240 4% 60%)', status: 'exempt' as PaymentStatusType },
            { label: '포기', value: withdrawnPayments, dot: 'hsl(240 4% 75%)', status: 'withdrawn' as PaymentStatusType },
          ].map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => s.value > 0 && setStatusModal(s.status)}
              disabled={s.value === 0}
              className="flex-1 px-6 py-4 text-left transition-colors hover:bg-accent disabled:cursor-default disabled:hover:bg-transparent"
            >
              <p className="text-sm font-semibold text-muted-foreground mb-1.5 flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: s.dot }} />{s.label}
              </p>
              <p className="text-xl font-bold tabular-nums text-foreground whitespace-nowrap">{s.value}<span className="text-sm font-medium text-muted-foreground ml-1">건</span></p>
            </button>
          ))}
        </CardContent>
      </Card>

      {/* 상태별 명단 모달 */}
      <Dialog open={!!statusModal} onOpenChange={(o) => !o && setStatusModal(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {statusModal ? PAYMENT_STATUS_LABELS[statusModal] : ''} 명단 ({statusModalList.length}건)
            </DialogTitle>
          </DialogHeader>
          {renderGroupedList(statusModalList, false)}
        </DialogContent>
      </Dialog>

      {/* 결제수단별 명단 모달 */}
      <Dialog open={!!methodModal} onOpenChange={(o) => !o && setMethodModal(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {methodModal === 'unspecified' ? '미지정' : methodModal ? PAYMENT_METHOD_LABELS[methodModal] : ''} 납부 명단 ({methodModalList.length}건)
            </DialogTitle>
          </DialogHeader>
          {methodModal === 'unspecified' && (
            <p className="text-sm text-muted-foreground -mt-1">납부 기록은 있으나 결제수단이 지정되지 않은 건입니다. 수강생별 납부 기록에서 결제수단을 지정해 주세요.</p>
          )}
          {renderGroupedList(methodModalList, methodModal === 'unspecified')}
        </DialogContent>
      </Dialog>

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
                      {(row.withdrawnCount > 0 || row.exemptCount > 0) && (
                        <span className="text-muted-foreground ml-1.5 text-[0.82rem]" title="포기·면제 수강생 수 (수강생 수에서 제외됨)">
                          ({[
                            row.withdrawnCount > 0 ? `포기 ${row.withdrawnCount}` : null,
                            row.exemptCount > 0 ? `면제 ${row.exemptCount}` : null,
                          ].filter(Boolean).join(' · ')})
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
                      {(row.withdrawnCount > 0 || row.exemptCount > 0) && (
                        <span className="text-muted-foreground ml-1.5 text-[0.82rem]" title="포기·면제 수강생 수 (수강생 수에서 제외됨)">
                          ({[
                            row.withdrawnCount > 0 ? `포기 ${row.withdrawnCount}` : null,
                            row.exemptCount > 0 ? `면제 ${row.exemptCount}` : null,
                          ].filter(Boolean).join(' · ')})
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-foreground tabular-nums">{row.paidCount}명</TableCell>
                    <TableCell className={row.unpaidCount > 0 ? 'text-error' : 'text-success'}>
                      {row.unpaidCount}명
                    </TableCell>
                    <TableCell>
                      <RevenueBreakdownTooltip enrollments={row.revenueEnrollments} records={row.courseRecords}>
                        <span className="tabular-nums">{'\u20A9'}{row.quarterRevenue.toLocaleString()}</span>
                      </RevenueBreakdownTooltip>
                    </TableCell>
                    <TableCell>{'\u20A9'}{row.quarterExpected.toLocaleString()}</TableCell>
                    <TableCell className="text-foreground font-semibold tabular-nums">
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
        <DialogContent className="max-w-[820px]">
          <DialogHeader>
            <DialogTitle>수익 현황 내보내기</DialogTitle>
          </DialogHeader>

          <div className="mb-1 flex items-center gap-1.5 rounded-lg border border-border bg-muted/30 p-3 text-sm font-medium text-foreground">
            <Calendar className="h-4 w-4 text-primary" />
            {filterMode === 'quarter' ? (
              <span>{getQuarterLabel(selectedQuarter)} 수익 {exportEnrollments.length}건을 내보냅니다.</span>
            ) : dateRange[0] && dateRange[1] ? (
              <span>{dayjs(dateRange[0]).format('YYYY.M.D')} ~ {dayjs(dateRange[1]).format('YYYY.M.D')} 수익 {exportEnrollments.length}건을 내보냅니다.</span>
            ) : (
              <span>전체 기간 수익 {exportEnrollments.length}건을 내보냅니다.</span>
            )}
          </div>

          <div className="mt-3 mb-1">
            <span className="text-sm font-medium">강좌</span>
            <CourseCombobox
              className="mt-1.5"
              value={exportCourse}
              onChange={setExportCourse}
              courses={courses}
            />
          </div>

          <div style={{ marginTop: 8 }}>
            <div className="flex justify-between items-center mb-3">
              <button type="button" className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                onClick={() => setSelectedExportFields(isAllRevenueSelected ? [] : allRevenueFieldKeys)}>
                {isAllRevenueSelected ? '선택 해제' : '전체 선택'}
              </button>
              <span className="text-xs text-muted-foreground">{selectedExportFields.length}개 선택 · 드래그로 순서 변경</span>
            </div>

            <div className="flex flex-wrap gap-2 mb-2">
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
              <div className="flex flex-wrap gap-1.5 mb-2 p-3 rounded-lg bg-muted/30 border border-dashed border-border">
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

            {selectedExportFields.length > 0 && exportEnrollments.length > 0 && (
              <div className="rounded-lg border overflow-hidden mb-2">
                <div className="text-[0.73rem] font-semibold text-muted-foreground uppercase tracking-wide px-3 py-2 bg-muted/30">미리보기</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="border-b bg-muted/20">
                      {selectedExportFields.map((key) => { const f = REVENUE_EXPORT_FIELDS.find((x) => x.key === key); return <th key={key} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">{f?.label}</th>; })}
                    </tr></thead>
                    <tbody>
                      {exportEnrollments.slice(0, 3).map((enrollment) => (
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
