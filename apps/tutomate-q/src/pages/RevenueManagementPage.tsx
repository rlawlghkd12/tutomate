import React, { useEffect, useState, useMemo } from 'react';
import {
  DollarSign, CircleCheck, Clock, AlertTriangle,
  Download, FileSpreadsheet, FileText, Calendar,
} from 'lucide-react';
import { toast } from 'sonner';
import dayjs from 'dayjs';
import {
  Button, Dialog, DialogContent, DialogHeader, DialogTitle,
  Card, CardContent, Badge,
  Tabs, TabsContent, TabsList, TabsTrigger, Checkbox,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
  Input,
} from '@tutomate/ui';
import { EXEMPT_COLOR } from '@tutomate/core';
import { useCourseStore } from '@tutomate/core';
import { useStudentStore } from '@tutomate/core';
import { useEnrollmentStore } from '@tutomate/core';
import { usePaymentRecordStore } from '@tutomate/core';
import { getCurrentQuarter, getQuarterOptions } from '@tutomate/core';
import { PaymentForm } from '@tutomate/ui';
import type { Enrollment } from '@tutomate/core';
import { PAYMENT_METHOD_LABELS } from '@tutomate/core';
import { exportRevenueToExcel, exportRevenueToCSV, REVENUE_EXPORT_FIELDS } from '@tutomate/core';

const RevenueManagementPage: React.FC = () => {
  const { courses, loadCourses, getCourseById } = useCourseStore();
  const { students, loadStudents, getStudentById } = useStudentStore();
  const { enrollments, loadEnrollments } = useEnrollmentStore();
  const { loadRecords } = usePaymentRecordStore();

  const [selectedEnrollment, setSelectedEnrollment] = useState<Enrollment | null>(null);
  const [isPaymentModalVisible, setIsPaymentModalVisible] = useState(false);
  const [isExportModalVisible, setIsExportModalVisible] = useState(false);
  const [selectedExportFields, setSelectedExportFields] = useState<string[]>(['courseName', 'studentName', 'fee', 'paidAmount', 'remainingAmount', 'paymentStatus']);
  const [dateRange, setDateRange] = useState<[string, string]>(['', '']);
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string[]>([]);

  const [selectedQuarter, setSelectedQuarter] = useState<string>(getCurrentQuarter());

  useEffect(() => {
    loadCourses();
    loadStudents();
    loadEnrollments();
    loadRecords();
  }, [loadCourses, loadStudents, loadEnrollments, loadRecords]);

  // Filter enrollments
  const filteredEnrollments = useMemo(() => {
    let filtered = enrollments;

    if (dateRange[0] && dateRange[1]) {
      const startDate = dayjs(dateRange[0]).startOf('day');
      const endDate = dayjs(dateRange[1]).endOf('day');
      filtered = filtered.filter((enrollment) => {
        const enrollDate = dayjs(enrollment.enrolledAt);
        return enrollDate.isAfter(startDate) && enrollDate.isBefore(endDate);
      });
    }

    if (paymentStatusFilter.length > 0) {
      filtered = filtered.filter((enrollment) =>
        paymentStatusFilter.includes(enrollment.paymentStatus)
      );
    }

    return filtered;
  }, [enrollments, dateRange, paymentStatusFilter]);

  const revenueEnrollments = useMemo(() => filteredEnrollments.filter((e) => e.paymentStatus !== 'exempt'), [filteredEnrollments]);

  const totalRevenue = revenueEnrollments.reduce((sum, e) => sum + e.paidAmount, 0);
  const expectedRevenue = revenueEnrollments.reduce((sum, e) => {
    const course = getCourseById(e.courseId);
    return sum + (course?.fee || 0);
  }, 0);
  const totalUnpaid = expectedRevenue - totalRevenue;

  const completedPayments = filteredEnrollments.filter((e) => e.paymentStatus === 'completed').length;
  const partialPayments = filteredEnrollments.filter((e) => e.paymentStatus === 'partial').length;
  const pendingPayments = filteredEnrollments.filter((e) => e.paymentStatus === 'pending').length;
  const exemptPayments = filteredEnrollments.filter((e) => e.paymentStatus === 'exempt').length;

  const courseRevenueData = useMemo(() => courses.map((course) => {
    const courseEnrollments = filteredEnrollments.filter((e) => e.courseId === course.id);
    const nonExemptEnrollments = courseEnrollments.filter((e) => e.paymentStatus !== 'exempt');
    const revenue = nonExemptEnrollments.reduce((sum, e) => sum + e.paidAmount, 0);
    const expected = nonExemptEnrollments.length * course.fee;
    const unpaid = expected - revenue;
    const completed = courseEnrollments.filter((e) => e.paymentStatus === 'completed').length;

    return {
      courseId: course.id,
      courseName: course.name,
      studentCount: courseEnrollments.length,
      revenue,
      expected,
      unpaid,
      completionRate: nonExemptEnrollments.length > 0 ? (completed / nonExemptEnrollments.length) * 100 : 0,
    };
  }), [courses, filteredEnrollments]);

  const unpaidList = useMemo(() => filteredEnrollments
    .filter((e) => e.paymentStatus !== 'completed' && e.paymentStatus !== 'exempt')
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
  const quarterRevenueData = useMemo(() => {
    return courses.map((course) => {
      const courseEnrollments = enrollments.filter((e) => e.courseId === course.id && e.quarter === selectedQuarter);
      const nonExemptEnrollments = courseEnrollments.filter((e) => e.paymentStatus !== 'exempt');
      const quarterRevenue = nonExemptEnrollments.reduce((sum, e) => sum + e.paidAmount, 0);
      const quarterExpected = nonExemptEnrollments.length * course.fee;
      const paidCount = courseEnrollments.filter((e) => e.paymentStatus === 'completed').length;

      return {
        courseId: course.id,
        courseName: course.name,
        studentCount: courseEnrollments.length,
        paidCount,
        unpaidCount: nonExemptEnrollments.length - paidCount,
        quarterRevenue,
        quarterExpected,
        collectionRate: quarterExpected > 0 ? (quarterRevenue / quarterExpected) * 100 : 0,
      };
    }).filter((d) => d.studentCount > 0);
  }, [courses, enrollments, selectedQuarter]);

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

  const statusMap: Record<string, { color: string; text: string }> = {
    pending: { color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300', text: '미납' },
    partial: { color: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300', text: '부분납부' },
    completed: { color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300', text: '완납' },
    exempt: { color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300', text: '면제' },
  };

  const isDateRangeActive = (type: string) => {
    if (type === 'all') return !dateRange[0] && !dateRange[1];
    if (type === 'this-month') return dateRange[0] === dayjs().startOf('month').format('YYYY-MM-DD') && dateRange[1] === dayjs().endOf('month').format('YYYY-MM-DD');
    if (type === 'last-month') return dateRange[0] === dayjs().subtract(1, 'month').startOf('month').format('YYYY-MM-DD') && dateRange[1] === dayjs().subtract(1, 'month').endOf('month').format('YYYY-MM-DD');
    if (type === 'this-year') return dateRange[0] === dayjs().startOf('year').format('YYYY-MM-DD') && dateRange[1] === dayjs().endOf('year').format('YYYY-MM-DD');
    return false;
  };

  return (
    <div className="page-enter">
      {/* 필터 섹션 */}
      <Card className="mb-6">
        <CardContent className="p-4 space-y-4">
          {/* 날짜 범위 필터 */}
          <div className="flex items-center gap-3 flex-wrap justify-between">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-medium text-sm">기간 선택:</span>
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  value={dateRange[0]}
                  onChange={(e) => setDateRange([e.target.value, dateRange[1]])}
                  className="w-[150px] h-8 text-sm"
                />
                <span className="text-muted-foreground">~</span>
                <Input
                  type="date"
                  value={dateRange[1]}
                  onChange={(e) => setDateRange([dateRange[0], e.target.value])}
                  className="w-[150px] h-8 text-sm"
                />
              </div>
              <div className="flex gap-1">
                {[
                  { label: '전체', type: 'all' as const },
                  { label: '이번 달', type: 'this-month' as const },
                  { label: '지난 달', type: 'last-month' as const },
                  { label: '올해', type: 'this-year' as const },
                ].map((btn) => (
                  <Button
                    key={btn.type}
                    variant={isDateRangeActive(btn.type) ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setQuickDateRange(btn.type)}
                  >
                    {btn.label}
                  </Button>
                ))}
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => setIsExportModalVisible(true)}>
              <Download className="h-4 w-4" />
              내보내기
            </Button>
          </div>

          {/* 결제 상태 필터 */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-medium text-sm">결제 상태:</span>
            <div className="flex gap-1">
              <Button
                variant={paymentStatusFilter.length === 0 ? 'default' : 'outline'}
                size="sm"
                onClick={() => setPaymentStatusFilter([])}
              >
                전체
              </Button>
              <Button
                variant={paymentStatusFilter.length === 1 && paymentStatusFilter[0] === 'pending' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setPaymentStatusFilter(['pending'])}
              >
                미납만
              </Button>
              <Button
                variant={paymentStatusFilter.length === 2 && paymentStatusFilter.includes('pending') && paymentStatusFilter.includes('partial') ? 'default' : 'outline'}
                size="sm"
                onClick={() => setPaymentStatusFilter(['pending', 'partial'])}
              >
                미완납
              </Button>
              <Button
                variant={paymentStatusFilter.length === 1 && paymentStatusFilter[0] === 'completed' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setPaymentStatusFilter(['completed'])}
              >
                완납만
              </Button>
            </div>
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
                    const map: Record<string, string> = { pending: '미납', partial: '부분납부', completed: '완납' };
                    return map[s];
                  }).join(', ')}
                </>
              )}
              {' ( '}{filteredEnrollments.length}건 )
            </p>
          )}
        </CardContent>
      </Card>

      {/* 수익 통계 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1"><DollarSign className="h-3 w-3" /> 총 수익</p>
            <p className="text-xl font-bold text-green-600 dark:text-green-400">{totalRevenue.toLocaleString()}원</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1"><DollarSign className="h-3 w-3" /> 예상 총 수익</p>
            <p className="text-xl font-bold text-primary">{expectedRevenue.toLocaleString()}원</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> 총 미수금</p>
            <p className="text-xl font-bold text-red-600 dark:text-red-400">{totalUnpaid.toLocaleString()}원</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1"><CircleCheck className="h-3 w-3" /> 수익률</p>
            <p className="text-xl font-bold" style={{ color: EXEMPT_COLOR }}>
              {expectedRevenue > 0 ? ((totalRevenue / expectedRevenue) * 100).toFixed(1) : '0.0'}%
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1"><CircleCheck className="h-3 w-3" /> 완납</p>
            <p className="text-xl font-bold text-green-600 dark:text-green-400">{completedPayments}건</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" /> 부분납부</p>
            <p className="text-xl font-bold text-yellow-600 dark:text-yellow-400">{partialPayments}건</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> 미납</p>
            <p className="text-xl font-bold text-red-600 dark:text-red-400">{pendingPayments}건</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">면제</p>
            <p className="text-xl font-bold" style={{ color: EXEMPT_COLOR }}>{exemptPayments}건</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="course-revenue">
        <TabsList>
          <TabsTrigger value="course-revenue">강좌별 수익</TabsTrigger>
          <TabsTrigger value="unpaid">미납자 관리 ({unpaidList.length})</TabsTrigger>
          <TabsTrigger value="monthly" className="flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5" /> 분기별 수익 현황
          </TabsTrigger>
        </TabsList>

        <TabsContent value="course-revenue">
          <div className="rounded-md border">
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
                    <TableCell>{row.courseName}</TableCell>
                    <TableCell>{row.studentCount}</TableCell>
                    <TableCell>{'\u20A9'}{row.revenue.toLocaleString()}</TableCell>
                    <TableCell>{'\u20A9'}{row.expected.toLocaleString()}</TableCell>
                    <TableCell className={row.unpaid > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}>
                      {'\u20A9'}{row.unpaid.toLocaleString()}
                    </TableCell>
                    <TableCell>{row.completionRate.toFixed(1)}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="unpaid">
          <div className="rounded-md border">
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
                      <TableCell>{row.studentName}</TableCell>
                      <TableCell>{row.studentPhone}</TableCell>
                      <TableCell>{row.courseName}</TableCell>
                      <TableCell>{'\u20A9'}{row.courseFee.toLocaleString()}</TableCell>
                      <TableCell>
                        <Badge className={s?.color} variant="outline">{s?.text}</Badge>
                      </TableCell>
                      <TableCell>{'\u20A9'}{row.paidAmount.toLocaleString()}</TableCell>
                      <TableCell>{row.paidAt || '-'}</TableCell>
                      <TableCell>
                        {row.paymentMethod ? PAYMENT_METHOD_LABELS[row.paymentMethod as keyof typeof PAYMENT_METHOD_LABELS] : '-'}
                      </TableCell>
                      <TableCell>
                        {row.discountAmount > 0
                          ? <span className="text-green-600 dark:text-green-400">-{'\u20A9'}{row.discountAmount.toLocaleString()}</span>
                          : '-'}
                      </TableCell>
                      <TableCell className="text-red-600 dark:text-red-400 font-bold">
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
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Select value={selectedQuarter} onValueChange={setSelectedQuarter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {getQuarterOptions().map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedQuarter(getCurrentQuarter())}
              >
                이번 분기
              </Button>
            </div>
            <div className="flex items-center gap-6 text-sm">
              <div>
                <span className="text-muted-foreground">분기 수익: </span>
                <span className="font-semibold text-green-600 dark:text-green-400">{'\u20A9'}{quarterTotalRevenue.toLocaleString()}</span>
              </div>
              <div>
                <span className="text-muted-foreground">예상: </span>
                <span className="font-semibold">{'\u20A9'}{quarterTotalExpected.toLocaleString()}</span>
              </div>
              <div>
                <span className="text-muted-foreground">수납률: </span>
                <span className={`font-semibold ${quarterTotalExpected > 0 && quarterTotalRevenue < quarterTotalExpected ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                  {quarterTotalExpected > 0 ? Math.round((quarterTotalRevenue / quarterTotalExpected) * 100) : 0}%
                </span>
              </div>
            </div>
          </div>
          <div className="rounded-md border">
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
                {quarterRevenueData.map((row) => (
                  <TableRow key={row.courseId}>
                    <TableCell>{row.courseName}</TableCell>
                    <TableCell>{row.studentCount}</TableCell>
                    <TableCell className="text-green-600 dark:text-green-400">{row.paidCount}명</TableCell>
                    <TableCell className={row.unpaidCount > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}>
                      {row.unpaidCount}명
                    </TableCell>
                    <TableCell>{'\u20A9'}{row.quarterRevenue.toLocaleString()}</TableCell>
                    <TableCell>{'\u20A9'}{row.quarterExpected.toLocaleString()}</TableCell>
                    <TableCell className={row.collectionRate >= 100 ? 'text-green-600 dark:text-green-400' : row.collectionRate >= 50 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400'}>
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

      {/* 내보내기 모달 */}
      <Dialog open={isExportModalVisible} onOpenChange={setIsExportModalVisible}>
        <DialogContent className="max-w-[320px]">
          <DialogHeader>
            <DialogTitle>수익 현황 내보내기</DialogTitle>
          </DialogHeader>

          <div className="flex justify-between items-center py-1 pb-2 border-b mb-3">
            <div className="flex items-center gap-2">
              <Checkbox
                checked={isAllRevenueSelected}
                onCheckedChange={(checked) => setSelectedExportFields(checked ? allRevenueFieldKeys : [])}
              />
              <span className="text-sm">전체 선택</span>
            </div>
            <span className="text-xs text-muted-foreground">
              {selectedExportFields.length}/{allRevenueFieldKeys.length}
            </span>
          </div>

          <div className="flex flex-col gap-0.5 mb-4">
            {REVENUE_EXPORT_FIELDS.map((field) => {
              const isChecked = selectedExportFields.includes(field.key);
              return (
                <div
                  key={field.key}
                  onClick={() => {
                    setSelectedExportFields((prev) =>
                      isChecked ? prev.filter((k) => k !== field.key) : [...prev, field.key]
                    );
                  }}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer ${
                    isChecked ? 'bg-primary/10' : 'hover:bg-accent'
                  }`}
                >
                  <Checkbox checked={isChecked} />
                  <span className="text-[13px]">{field.label}</span>
                </div>
              );
            })}
          </div>

          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => handleExport('excel')}>
              <FileSpreadsheet className="h-4 w-4" />
              Excel
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => handleExport('csv')}>
              <FileText className="h-4 w-4" />
              CSV
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RevenueManagementPage;
