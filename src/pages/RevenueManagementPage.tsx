import React, { useEffect, useState, useMemo } from 'react';
import {
  Card,
  Row,
  Col,
  Statistic,
  Table,
  Tag,
  Typography,
  Button,
  Tabs,
  message,
  DatePicker,
  Space,
  Select,
  Modal,
  Checkbox,
  theme,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  DollarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  WarningOutlined,
  DownloadOutlined,
  FileExcelOutlined,
  FileTextOutlined,
  CalendarOutlined,
} from '@ant-design/icons';
import { EXEMPT_COLOR } from '../config/styles';
import { useCourseStore } from '../stores/courseStore';
import { useStudentStore } from '../stores/studentStore';
import { useEnrollmentStore } from '../stores/enrollmentStore';
import { useMonthlyPaymentStore } from '../stores/monthlyPaymentStore';
import PaymentForm from '../components/payment/PaymentForm';
import type { Enrollment, PaymentMethod } from '../types';
import { PAYMENT_METHOD_LABELS } from '../types';
import { exportRevenueToExcel, exportRevenueToCSV, REVENUE_EXPORT_FIELDS } from '../utils/export';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';

const { RangePicker } = DatePicker;

const RevenueManagementPage: React.FC = () => {
  const { token } = theme.useToken();
  const { courses, loadCourses, getCourseById } = useCourseStore();
  const { students, loadStudents, getStudentById } = useStudentStore();
  const { enrollments, loadEnrollments } = useEnrollmentStore();
  const { payments: monthlyPayments, loadPayments } = useMonthlyPaymentStore();

  const [selectedEnrollment, setSelectedEnrollment] = useState<Enrollment | null>(null);
  const [isPaymentModalVisible, setIsPaymentModalVisible] = useState(false);
  const [isExportModalVisible, setIsExportModalVisible] = useState(false);
  const [selectedExportFields, setSelectedExportFields] = useState<string[]>(['courseName', 'studentName', 'fee', 'paidAmount', 'remainingAmount', 'paymentStatus']);
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null]>([null, null]);
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string[]>([]);

  const [selectedMonthForRevenue, setSelectedMonthForRevenue] = useState<string>(dayjs().format('YYYY-MM'));

  useEffect(() => {
    loadCourses();
    loadStudents();
    loadEnrollments();
    loadPayments();
  }, [loadCourses, loadStudents, loadEnrollments, loadPayments]);

  // 날짜 범위 및 결제 상태에 따라 필터링된 수강 신청 목록
  const filteredEnrollments = useMemo(() => {
    let filtered = enrollments;

    // 날짜 범위 필터
    if (dateRange[0] && dateRange[1]) {
      const startDate = dateRange[0].startOf('day');
      const endDate = dateRange[1].endOf('day');

      filtered = filtered.filter((enrollment) => {
        const enrollDate = dayjs(enrollment.enrolledAt);
        return enrollDate.isAfter(startDate) && enrollDate.isBefore(endDate);
      });
    }

    // 결제 상태 필터
    if (paymentStatusFilter.length > 0) {
      filtered = filtered.filter((enrollment) =>
        paymentStatusFilter.includes(enrollment.paymentStatus)
      );
    }

    return filtered;
  }, [enrollments, dateRange, paymentStatusFilter]);

  // 면제 제외한 수익 계산용 목록
  const revenueEnrollments = useMemo(() => filteredEnrollments.filter((e) => e.paymentStatus !== 'exempt'), [filteredEnrollments]);

  // 전체 통계 계산 (면제 제외)
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

  // 강좌별 수익 테이블 데이터
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

  // 미납자 목록 (면제 제외)
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

  // 월별 납부 현황 (강좌별)
  const monthlyRevenueData = useMemo(() => {
    const monthPayments = monthlyPayments.filter((p) => p.month === selectedMonthForRevenue);

    return courses.map((course) => {
      const courseEnrollments = enrollments.filter((e) => e.courseId === course.id);
      const nonExemptEnrollments = courseEnrollments.filter((e) => e.paymentStatus !== 'exempt');
      const courseMonthPayments = monthPayments.filter((mp) =>
        courseEnrollments.some((e) => e.id === mp.enrollmentId),
      );
      const paidCount = courseMonthPayments.filter((p) => p.status === 'paid').length;
      const monthRevenue = courseMonthPayments.reduce((sum, p) => sum + p.amount, 0);
      const monthExpected = nonExemptEnrollments.length * course.fee;

      return {
        courseId: course.id,
        courseName: course.name,
        studentCount: courseEnrollments.length,
        paidCount,
        unpaidCount: nonExemptEnrollments.length - paidCount,
        monthRevenue,
        monthExpected,
        collectionRate: monthExpected > 0 ? (monthRevenue / monthExpected) * 100 : 0,
      };
    }).filter((d) => d.studentCount > 0);
  }, [courses, enrollments, monthlyPayments, selectedMonthForRevenue]);

  const monthlyTotalRevenue = useMemo(() => monthlyRevenueData.reduce((sum, d) => sum + d.monthRevenue, 0), [monthlyRevenueData]);
  const monthlyTotalExpected = useMemo(() => monthlyRevenueData.reduce((sum, d) => sum + d.monthExpected, 0), [monthlyRevenueData]);

  const handlePaymentEdit = (enrollment: Enrollment) => {
    setSelectedEnrollment(enrollment);
    setIsPaymentModalVisible(true);
  };

  // 날짜 범위 빠른 필터
  const setQuickDateRange = (type: 'this-month' | 'last-month' | 'this-year' | 'all') => {
    switch (type) {
      case 'this-month':
        setDateRange([dayjs().startOf('month'), dayjs().endOf('month')]);
        break;
      case 'last-month':
        setDateRange([
          dayjs().subtract(1, 'month').startOf('month'),
          dayjs().subtract(1, 'month').endOf('month'),
        ]);
        break;
      case 'this-year':
        setDateRange([dayjs().startOf('year'), dayjs().endOf('year')]);
        break;
      case 'all':
        setDateRange([null, null]);
        break;
    }
  };

  const handleExport = (type: 'excel' | 'csv') => {
    if (selectedExportFields.length === 0) {
      message.warning('내보낼 필드를 1개 이상 선택해주세요.');
      return;
    }

    if (enrollments.length === 0) {
      message.warning('내보낼 수익 데이터가 없습니다');
      return;
    }

    try {
      if (type === 'excel') {
        exportRevenueToExcel(enrollments, students, courses, selectedExportFields);
        message.success('Excel 파일이 다운로드되었습니다');
      } else {
        exportRevenueToCSV(enrollments, students, courses, 'utf-8', selectedExportFields);
        message.success('CSV 파일이 다운로드되었습니다');
      }
      setIsExportModalVisible(false);
    } catch (error) {
      message.error('파일 내보내기에 실패했습니다');
    }
  };

  const allRevenueFieldKeys = useMemo(() => REVENUE_EXPORT_FIELDS.map((f) => f.key), []);
  const isAllRevenueSelected = selectedExportFields.length === allRevenueFieldKeys.length;

  const courseColumns: ColumnsType<typeof courseRevenueData[0]> = [
    {
      title: '강좌명',
      dataIndex: 'courseName',
      key: 'courseName',
    },
    {
      title: '수강생 수',
      dataIndex: 'studentCount',
      key: 'studentCount',
      sorter: (a, b) => a.studentCount - b.studentCount,
    },
    {
      title: '수익',
      dataIndex: 'revenue',
      key: 'revenue',
      render: (revenue) => `₩${revenue.toLocaleString()}`,
      sorter: (a, b) => a.revenue - b.revenue,
    },
    {
      title: '예상 수익',
      dataIndex: 'expected',
      key: 'expected',
      render: (expected) => `₩${expected.toLocaleString()}`,
      sorter: (a, b) => a.expected - b.expected,
    },
    {
      title: '미수금',
      dataIndex: 'unpaid',
      key: 'unpaid',
      render: (unpaid) => (
        <span style={{ color: unpaid > 0 ? token.colorError : token.colorSuccess }}>
          ₩{unpaid.toLocaleString()}
        </span>
      ),
      sorter: (a, b) => a.unpaid - b.unpaid,
    },
    {
      title: '완납률',
      dataIndex: 'completionRate',
      key: 'completionRate',
      render: (rate) => `${rate.toFixed(1)}%`,
      sorter: (a, b) => a.completionRate - b.completionRate,
    },
  ];

  const unpaidColumns: ColumnsType<typeof unpaidList[0]> = [
    {
      title: '수강생',
      dataIndex: 'studentName',
      key: 'studentName',
    },
    {
      title: '전화번호',
      dataIndex: 'studentPhone',
      key: 'studentPhone',
    },
    {
      title: '강좌',
      dataIndex: 'courseName',
      key: 'courseName',
    },
    {
      title: '수강료',
      dataIndex: 'courseFee',
      key: 'courseFee',
      render: (fee) => `₩${fee.toLocaleString()}`,
    },
    {
      title: '납부 상태',
      dataIndex: 'paymentStatus',
      key: 'paymentStatus',
      render: (status) => {
        const statusMap = {
          pending: { color: 'red', text: '미납' },
          partial: { color: 'orange', text: '부분납부' },
          completed: { color: 'green', text: '완납' },
          exempt: { color: 'purple', text: '면제' },
        };
        const s = statusMap[status as keyof typeof statusMap];
        return <Tag color={s.color}>{s.text}</Tag>;
      },
      filters: [
        { text: '미납', value: 'pending' },
        { text: '부분납부', value: 'partial' },
      ],
      onFilter: (value, record) => record.paymentStatus === value,
    },
    {
      title: '납부 금액',
      dataIndex: 'paidAmount',
      key: 'paidAmount',
      render: (amount) => `₩${amount.toLocaleString()}`,
      sorter: (a, b) => a.paidAmount - b.paidAmount,
    },
    {
      title: '납부일',
      dataIndex: 'paidAt',
      key: 'paidAt',
      render: (date) => date || '-',
      sorter: (a, b) => (a.paidAt || '').localeCompare(b.paidAt || ''),
    },
    {
      title: '납부 방법',
      dataIndex: 'paymentMethod',
      key: 'paymentMethod',
      render: (method: PaymentMethod | undefined) => method ? PAYMENT_METHOD_LABELS[method] : '-',
      filters: [
        { text: '현금', value: 'cash' },
        { text: '카드', value: 'card' },
        { text: '계좌이체', value: 'transfer' },
      ],
      onFilter: (value, record) => record.paymentMethod === value,
    },
    {
      title: '할인',
      dataIndex: 'discountAmount',
      key: 'discountAmount',
      render: (amount: number) => amount > 0 ? <span style={{ color: token.colorSuccess }}>-₩{amount.toLocaleString()}</span> : '-',
      sorter: (a, b) => (a.discountAmount ?? 0) - (b.discountAmount ?? 0),
    },
    {
      title: '잔여 금액',
      dataIndex: 'remainingAmount',
      key: 'remainingAmount',
      render: (amount) => (
        <span style={{ color: token.colorError, fontWeight: 'bold' }}>
          ₩{amount.toLocaleString()}
        </span>
      ),
      sorter: (a, b) => a.remainingAmount - b.remainingAmount,
    },
    {
      title: '작업',
      key: 'action',
      render: (_, record) => (
        <Button type="link" onClick={() => handlePaymentEdit(record)}>
          납부 처리
        </Button>
      ),
    },
  ];

  const monthlyRevenueColumns: ColumnsType<typeof monthlyRevenueData[0]> = [
    {
      title: '강좌명',
      dataIndex: 'courseName',
      key: 'courseName',
    },
    {
      title: '수강생',
      dataIndex: 'studentCount',
      key: 'studentCount',
      width: 80,
    },
    {
      title: '납부',
      dataIndex: 'paidCount',
      key: 'paidCount',
      width: 70,
      render: (count) => <span style={{ color: token.colorSuccess }}>{count}명</span>,
    },
    {
      title: '미납',
      dataIndex: 'unpaidCount',
      key: 'unpaidCount',
      width: 70,
      render: (count) => <span style={{ color: count > 0 ? token.colorError : token.colorSuccess }}>{count}명</span>,
    },
    {
      title: '월 수익',
      dataIndex: 'monthRevenue',
      key: 'monthRevenue',
      render: (val) => `₩${val.toLocaleString()}`,
      sorter: (a, b) => a.monthRevenue - b.monthRevenue,
    },
    {
      title: '예상 수익',
      dataIndex: 'monthExpected',
      key: 'monthExpected',
      render: (val) => `₩${val.toLocaleString()}`,
    },
    {
      title: '수납률',
      dataIndex: 'collectionRate',
      key: 'collectionRate',
      render: (rate) => (
        <span style={{ color: rate >= 100 ? token.colorSuccess : rate >= 50 ? token.colorWarning : token.colorError }}>
          {rate.toFixed(1)}%
        </span>
      ),
      sorter: (a, b) => a.collectionRate - b.collectionRate,
    },
  ];

  const revenueMonths = useMemo(() => {
    const result: string[] = [];
    for (let i = -6; i <= 6; i++) {
      result.push(dayjs().add(i, 'month').format('YYYY-MM'));
    }
    return result;
  }, []);

  const tabItems = [
    {
      key: '1',
      label: '강좌별 수익',
      children: (
        <Table
          columns={courseColumns}
          dataSource={courseRevenueData}
          rowKey="courseId"
          pagination={false}
          size="small"
        />
      ),
    },
    {
      key: '2',
      label: `미납자 관리 (${unpaidList.length})`,
      children: (
        <Table
          columns={unpaidColumns}
          dataSource={unpaidList}
          rowKey="id"
          pagination={false}
          size="small"
        />
      ),
    },
    {
      key: '3',
      label: <span><CalendarOutlined /> 월별 납부 현황</span>,
      children: (
        <div>
          <Row gutter={16} align="middle" style={{ marginBottom: 16 }}>
            <Col>
              <Space>
                <Select
                  value={selectedMonthForRevenue}
                  onChange={setSelectedMonthForRevenue}
                  style={{ width: 140 }}
                >
                  {revenueMonths.map((m) => (
                    <Select.Option key={m} value={m}>
                      {dayjs(m + '-01').format('YYYY년 M월')}
                    </Select.Option>
                  ))}
                </Select>
                <Button
                  size="small"
                  onClick={() => setSelectedMonthForRevenue(dayjs().format('YYYY-MM'))}
                >
                  이번 달
                </Button>
              </Space>
            </Col>
            <Col flex="auto" style={{ textAlign: 'right' }}>
              <Space size="large">
                <div>
                  <span style={{ fontSize: 12, color: token.colorTextSecondary }}>월 수익: </span>
                  <span style={{ fontWeight: 600, color: token.colorSuccess }}>₩{monthlyTotalRevenue.toLocaleString()}</span>
                </div>
                <div>
                  <span style={{ fontSize: 12, color: token.colorTextSecondary }}>예상: </span>
                  <span style={{ fontWeight: 600 }}>₩{monthlyTotalExpected.toLocaleString()}</span>
                </div>
                <div>
                  <span style={{ fontSize: 12, color: token.colorTextSecondary }}>수납률: </span>
                  <span style={{ fontWeight: 600, color: monthlyTotalExpected > 0 && monthlyTotalRevenue < monthlyTotalExpected ? token.colorError : token.colorSuccess }}>
                    {monthlyTotalExpected > 0 ? Math.round((monthlyTotalRevenue / monthlyTotalExpected) * 100) : 0}%
                  </span>
                </div>
              </Space>
            </Col>
          </Row>
          <Table
            columns={monthlyRevenueColumns}
            dataSource={monthlyRevenueData}
            rowKey="courseId"
            pagination={false}
            size="small"
          />
        </div>
      ),
    },
  ];

  return (
    <div>
      {/* 필터 섹션 */}
      <Card style={{ marginBottom: 24 }}>
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          {/* 날짜 범위 필터 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 500 }}>기간 선택:</span>
            <RangePicker
              value={dateRange}
              onChange={(dates) => setDateRange(dates as [Dayjs | null, Dayjs | null])}
              format="YYYY-MM-DD"
              placeholder={['시작일', '종료일']}
              style={{ width: 280 }}
            />
            <Space>
              <Button
                size="small"
                type={!dateRange[0] && !dateRange[1] ? 'primary' : 'default'}
                onClick={() => setQuickDateRange('all')}
              >
                전체
              </Button>
              <Button
                size="small"
                type={
                  dateRange[0]?.isSame(dayjs().startOf('month'), 'day') &&
                  dateRange[1]?.isSame(dayjs().endOf('month'), 'day')
                    ? 'primary'
                    : 'default'
                }
                onClick={() => setQuickDateRange('this-month')}
              >
                이번 달
              </Button>
              <Button
                size="small"
                type={
                  dateRange[0]?.isSame(dayjs().subtract(1, 'month').startOf('month'), 'day') &&
                  dateRange[1]?.isSame(dayjs().subtract(1, 'month').endOf('month'), 'day')
                    ? 'primary'
                    : 'default'
                }
                onClick={() => setQuickDateRange('last-month')}
              >
                지난 달
              </Button>
              <Button
                size="small"
                type={
                  dateRange[0]?.isSame(dayjs().startOf('year'), 'day') &&
                  dateRange[1]?.isSame(dayjs().endOf('year'), 'day')
                    ? 'primary'
                    : 'default'
                }
                onClick={() => setQuickDateRange('this-year')}
              >
                올해
              </Button>
            </Space>
            </div>
            <Button icon={<DownloadOutlined />} onClick={() => setIsExportModalVisible(true)}>내보내기</Button>
          </div>

          {/* 결제 상태 필터 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 500 }}>결제 상태:</span>
            <Select
              mode="multiple"
              placeholder="전체 상태"
              value={paymentStatusFilter}
              onChange={setPaymentStatusFilter}
              style={{ minWidth: 280 }}
              allowClear
              options={[
                { label: '미납', value: 'pending' },
                { label: '부분납부', value: 'partial' },
                { label: '완납', value: 'completed' },
                { label: '면제', value: 'exempt' },
              ]}
              maxTagCount="responsive"
            />
            <Space>
              <Button
                size="small"
                type={paymentStatusFilter.length === 0 ? 'primary' : 'default'}
                onClick={() => setPaymentStatusFilter([])}
              >
                전체
              </Button>
              <Button
                size="small"
                type={
                  paymentStatusFilter.length === 1 && paymentStatusFilter[0] === 'pending'
                    ? 'primary'
                    : 'default'
                }
                onClick={() => setPaymentStatusFilter(['pending'])}
              >
                미납만
              </Button>
              <Button
                size="small"
                type={
                  paymentStatusFilter.length === 2 &&
                  paymentStatusFilter.includes('pending') &&
                  paymentStatusFilter.includes('partial')
                    ? 'primary'
                    : 'default'
                }
                onClick={() => setPaymentStatusFilter(['pending', 'partial'])}
              >
                미완납
              </Button>
              <Button
                size="small"
                type={
                  paymentStatusFilter.length === 1 && paymentStatusFilter[0] === 'completed'
                    ? 'primary'
                    : 'default'
                }
                onClick={() => setPaymentStatusFilter(['completed'])}
              >
                완납만
              </Button>
            </Space>
          </div>

          {/* 필터 요약 */}
          {(dateRange[0] || dateRange[1] || paymentStatusFilter.length > 0) && (
            <Typography.Text type="secondary" style={{ fontSize: '13px' }}>
              {dateRange[0] && dateRange[1] && (
                <>
                  {dateRange[0].format('YYYY년 M월 D일')} ~ {dateRange[1].format('YYYY년 M월 D일')}
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
                      };
                      return map[s];
                    })
                    .join(', ')}
                </>
              )}
              {' ( '}
              {filteredEnrollments.length}건 )
            </Typography.Text>
          )}
        </Space>
      </Card>

      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small">
            <Statistic
              title="총 수익"
              value={totalRevenue}
              prefix={<DollarOutlined />}
              suffix="원"
              valueStyle={{ color: token.colorSuccess, fontSize: 20 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small">
            <Statistic
              title="예상 총 수익"
              value={expectedRevenue}
              prefix={<DollarOutlined />}
              suffix="원"
              valueStyle={{ color: token.colorPrimary, fontSize: 20 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small">
            <Statistic
              title="총 미수금"
              value={totalUnpaid}
              prefix={<WarningOutlined />}
              suffix="원"
              valueStyle={{ color: token.colorError, fontSize: 20 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small">
            <Statistic
              title="수익률"
              value={expectedRevenue > 0 ? (totalRevenue / expectedRevenue) * 100 : 0}
              precision={1}
              suffix="%"
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: EXEMPT_COLOR, fontSize: 20 }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={6}>
          <Card size="small">
            <Statistic
              title="완납"
              value={completedPayments}
              suffix="건"
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: token.colorSuccess, fontSize: 20 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={6}>
          <Card size="small">
            <Statistic
              title="부분납부"
              value={partialPayments}
              suffix="건"
              prefix={<ClockCircleOutlined />}
              valueStyle={{ color: token.colorWarning, fontSize: 20 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={6}>
          <Card size="small">
            <Statistic
              title="미납"
              value={pendingPayments}
              suffix="건"
              prefix={<WarningOutlined />}
              valueStyle={{ color: token.colorError, fontSize: 20 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={6}>
          <Card size="small">
            <Statistic
              title="면제"
              value={exemptPayments}
              suffix="건"
              valueStyle={{ color: EXEMPT_COLOR, fontSize: 20 }}
            />
          </Card>
        </Col>
      </Row>

      <Tabs items={tabItems} />

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

      <Modal
        title="수익 현황 내보내기"
        open={isExportModalVisible}
        onCancel={() => setIsExportModalVisible(false)}
        width={320}
        footer={null}
        styles={{ body: { paddingBottom: 24 } }}
      >
        <div style={{
          padding: '4px 0 8px',
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
          marginBottom: 12,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <Checkbox
            checked={isAllRevenueSelected}
            indeterminate={selectedExportFields.length > 0 && !isAllRevenueSelected}
            onChange={(e) => setSelectedExportFields(e.target.checked ? allRevenueFieldKeys : [])}
          >
            전체 선택
          </Checkbox>
          <span style={{ fontSize: 12, color: token.colorTextTertiary }}>
            {selectedExportFields.length}/{allRevenueFieldKeys.length}
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 16 }}>
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
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 8px',
                  borderRadius: token.borderRadius,
                  cursor: 'pointer',
                  background: isChecked ? token.colorPrimaryBg : 'transparent',
                }}
              >
                <Checkbox checked={isChecked} />
                <span style={{ fontSize: 13 }}>{field.label}</span>
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <Button
            type="primary"
            icon={<FileExcelOutlined />}
            onClick={() => handleExport('excel')}
            block
          >
            Excel
          </Button>
          <Button
            icon={<FileTextOutlined />}
            onClick={() => handleExport('csv')}
            block
          >
            CSV
          </Button>
        </div>
      </Modal>
    </div>
  );
};

export default RevenueManagementPage;
