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
  Dropdown,
  message,
  DatePicker,
  Space,
  Select,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { MenuProps } from 'antd';
import {
  DollarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  WarningOutlined,
  DownloadOutlined,
} from '@ant-design/icons';
import { useCourseStore } from '../stores/courseStore';
import { useStudentStore } from '../stores/studentStore';
import { useEnrollmentStore } from '../stores/enrollmentStore';
import PaymentForm from '../components/payment/PaymentForm';
import type { Enrollment } from '../types';
import { exportRevenueToExcel, exportRevenueToCSV } from '../utils/export';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';

const { Title } = Typography;
const { RangePicker } = DatePicker;

const RevenueManagementPage: React.FC = () => {
  const { courses, loadCourses, getCourseById } = useCourseStore();
  const { students, loadStudents, getStudentById } = useStudentStore();
  const { enrollments, loadEnrollments } = useEnrollmentStore();

  const [selectedEnrollment, setSelectedEnrollment] = useState<Enrollment | null>(null);
  const [isPaymentModalVisible, setIsPaymentModalVisible] = useState(false);
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null]>([null, null]);
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string[]>([]);

  useEffect(() => {
    loadCourses();
    loadStudents();
    loadEnrollments();
  }, [loadCourses, loadStudents, loadEnrollments]);

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

  // 전체 통계 계산
  const totalRevenue = filteredEnrollments.reduce((sum, e) => sum + e.paidAmount, 0);
  const expectedRevenue = filteredEnrollments.reduce((sum, e) => {
    const course = getCourseById(e.courseId);
    return sum + (course?.fee || 0);
  }, 0);
  const totalUnpaid = expectedRevenue - totalRevenue;

  const completedPayments = filteredEnrollments.filter((e) => e.paymentStatus === 'completed').length;
  const partialPayments = filteredEnrollments.filter((e) => e.paymentStatus === 'partial').length;
  const pendingPayments = filteredEnrollments.filter((e) => e.paymentStatus === 'pending').length;

  // 강좌별 수익 테이블 데이터
  const courseRevenueData = courses.map((course) => {
    const courseEnrollments = filteredEnrollments.filter((e) => e.courseId === course.id);
    const revenue = courseEnrollments.reduce((sum, e) => sum + e.paidAmount, 0);
    const expected = courseEnrollments.length * course.fee;
    const unpaid = expected - revenue;
    const completed = courseEnrollments.filter((e) => e.paymentStatus === 'completed').length;

    return {
      courseId: course.id,
      courseName: course.name,
      studentCount: courseEnrollments.length,
      revenue,
      expected,
      unpaid,
      completionRate: courseEnrollments.length > 0 ? (completed / courseEnrollments.length) * 100 : 0,
    };
  });

  // 미납자 목록
  const unpaidList = filteredEnrollments
    .filter((e) => e.paymentStatus !== 'completed')
    .map((enrollment) => {
      const student = getStudentById(enrollment.studentId);
      const course = getCourseById(enrollment.courseId);

      return {
        ...enrollment,
        studentName: student?.name || '-',
        studentPhone: student?.phone || '-',
        courseName: course?.name || '-',
        courseFee: course?.fee || 0,
      };
    });

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

  const handleExport = (type: 'excel' | 'csv-utf8' | 'csv-euckr') => {
    if (enrollments.length === 0) {
      message.warning('내보낼 수익 데이터가 없습니다');
      return;
    }

    try {
      switch (type) {
        case 'excel':
          exportRevenueToExcel(enrollments, students, courses);
          message.success('Excel 파일이 다운로드되었습니다');
          break;
        case 'csv-utf8':
          exportRevenueToCSV(enrollments, students, courses, 'utf-8');
          message.success('CSV 파일(UTF-8)이 다운로드되었습니다');
          break;
        case 'csv-euckr':
          exportRevenueToCSV(enrollments, students, courses, 'euc-kr');
          message.success('CSV 파일(EUC-KR)이 다운로드되었습니다');
          break;
      }
    } catch (error) {
      message.error('파일 내보내기에 실패했습니다');
    }
  };

  const exportMenuItems: MenuProps['items'] = [
    {
      key: 'excel',
      label: 'Excel 파일 (.xlsx)',
      onClick: () => handleExport('excel'),
    },
    {
      key: 'csv-utf8',
      label: 'CSV 파일 (UTF-8)',
      onClick: () => handleExport('csv-utf8'),
    },
    {
      key: 'csv-euckr',
      label: 'CSV 파일 (EUC-KR)',
      onClick: () => handleExport('csv-euckr'),
    },
  ];

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
        <span style={{ color: unpaid > 0 ? '#ff4d4f' : '#52c41a' }}>
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
      title: '잔여 금액',
      dataIndex: 'remainingAmount',
      key: 'remainingAmount',
      render: (amount) => (
        <span style={{ color: '#ff4d4f', fontWeight: 'bold' }}>
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
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Title level={2}>수익 관리</Title>
        <Dropdown menu={{ items: exportMenuItems }} placement="bottomRight">
          <Button icon={<DownloadOutlined />}>내보내기</Button>
        </Dropdown>
      </div>

      {/* 필터 섹션 */}
      <Card style={{ marginTop: 16, marginBottom: 24 }}>
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          {/* 날짜 범위 필터 */}
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

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="총 수익"
              value={totalRevenue}
              prefix={<DollarOutlined />}
              suffix="원"
              valueStyle={{ color: '#3f8600' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="예상 총 수익"
              value={expectedRevenue}
              prefix={<DollarOutlined />}
              suffix="원"
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="총 미수금"
              value={totalUnpaid}
              prefix={<WarningOutlined />}
              suffix="원"
              valueStyle={{ color: '#cf1322' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="수익률"
              value={expectedRevenue > 0 ? (totalRevenue / expectedRevenue) * 100 : 0}
              precision={1}
              suffix="%"
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="완납"
              value={completedPayments}
              suffix="건"
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="부분납부"
              value={partialPayments}
              suffix="건"
              prefix={<ClockCircleOutlined />}
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="미납"
              value={pendingPayments}
              suffix="건"
              prefix={<WarningOutlined />}
              valueStyle={{ color: '#f5222d' }}
            />
          </Card>
        </Col>
      </Row>

      <Card>
        <Tabs items={tabItems} />
      </Card>

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
    </div>
  );
};

export default RevenueManagementPage;
