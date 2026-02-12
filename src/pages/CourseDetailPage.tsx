import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card,
  Table,
  Tag,
  Button,
  Space,
  Tabs,
  Progress,
  Statistic,
  Row,
  Col,
  message,
  Popconfirm,
  Typography,
  theme,
} from 'antd';

const { useToken } = theme;
import type { ColumnsType } from 'antd/es/table';
import {
  ArrowLeftOutlined,
  DollarOutlined,
  UserOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import { useCourseStore } from '../stores/courseStore';
import { useStudentStore } from '../stores/studentStore';
import { useEnrollmentStore } from '../stores/enrollmentStore';
import { useAttendanceStore } from '../stores/attendanceStore';
import type { Enrollment } from '../types';
import AttendanceSheet from '../components/attendance/AttendanceSheet';
import PaymentForm from '../components/payment/PaymentForm';
import BulkPaymentForm from '../components/payment/BulkPaymentForm';
import { exportAttendanceToExcel } from '../utils/export';

const CourseDetailPage: React.FC = () => {
  const { token } = useToken();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getCourseById, loadCourses } = useCourseStore();
  const { students, loadStudents, getStudentById } = useStudentStore();
  const { enrollments, loadEnrollments, deleteEnrollment } = useEnrollmentStore();
  const { attendances, loadAttendances } = useAttendanceStore();

  const [selectedEnrollment, setSelectedEnrollment] = useState<Enrollment | null>(null);
  const [isPaymentModalVisible, setIsPaymentModalVisible] = useState(false);
  const [isBulkPaymentModalVisible, setIsBulkPaymentModalVisible] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);

  useEffect(() => {
    loadCourses();
    loadStudents();
    loadEnrollments();
    loadAttendances();
  }, [loadCourses, loadStudents, loadEnrollments, loadAttendances]);

  if (!id) {
    return <div>강좌를 찾을 수 없습니다.</div>;
  }

  const course = getCourseById(id);

  if (!course) {
    return <div>강좌를 찾을 수 없습니다.</div>;
  }

  const courseEnrollments = enrollments.filter((e) => e.courseId === id);

  // 출석률을 포함한 수강생 목록
  const enrolledStudents = useMemo(() => {
    return courseEnrollments.map((enrollment) => {
      const student = getStudentById(enrollment.studentId);

      // 해당 학생의 출석 기록
      const studentAttendances = attendances.filter(
        (a) => a.courseId === id && a.studentId === enrollment.studentId
      );

      // 출석률 계산
      const totalSessions = studentAttendances.length;
      const presentCount = studentAttendances.filter((a) => a.status === 'present').length;
      const lateCount = studentAttendances.filter((a) => a.status === 'late').length;
      const attendanceRate =
        totalSessions > 0 ? ((presentCount + lateCount * 0.5) / totalSessions) * 100 : 100;

      return {
        ...enrollment,
        student,
        attendanceRate,
        totalSessions,
        presentCount,
        lateCount,
      };
    });
  }, [courseEnrollments, attendances, id, getStudentById]);

  const totalRevenue = courseEnrollments.reduce((sum, e) => sum + e.paidAmount, 0);
  const nonExemptEnrollments = courseEnrollments.filter(e => e.paymentStatus !== 'exempt');
  const expectedRevenue = nonExemptEnrollments.length * course.fee;
  const completedPayments = courseEnrollments.filter((e) => e.paymentStatus === 'completed').length;

  const handleRemoveStudent = (enrollmentId: string) => {
    deleteEnrollment(enrollmentId);
    message.success('수강생이 제거되었습니다.');
  };

  const handlePaymentEdit = (enrollment: Enrollment) => {
    setSelectedEnrollment(enrollment);
    setIsPaymentModalVisible(true);
  };

  const handleExportAttendance = () => {
    if (courseEnrollments.length === 0) {
      message.warning('출석부를 내보낼 수강생이 없습니다');
      return;
    }

    try {
      exportAttendanceToExcel(course, students, enrollments, attendances);
      message.success('출석부 Excel 파일이 다운로드되었습니다');
    } catch (error) {
      message.error('출석부 내보내기에 실패했습니다');
    }
  };

  const columns: ColumnsType<typeof enrolledStudents[0]> = [
    {
      title: '이름',
      key: 'name',
      render: (_, record) => record.student?.name || '-',
      sorter: (a, b) => (a.student?.name || '').localeCompare(b.student?.name || ''),
    },
    {
      title: '전화번호',
      key: 'phone',
      render: (_, record) => record.student?.phone || '-',
    },
    {
      title: '이메일',
      key: 'email',
      render: (_, record) => record.student?.email || '-',
    },
    {
      title: '납부 현황',
      key: 'paymentStatus',
      render: (_, record) => {
        const statusMap = {
          pending: { color: 'red', text: '미납' },
          partial: { color: 'orange', text: '부분납부' },
          completed: { color: 'green', text: '완납' },
          exempt: { color: 'purple', text: '면제' },
        };
        const status = statusMap[record.paymentStatus];
        return <Tag color={status.color}>{status.text}</Tag>;
      },
      filters: [
        { text: '미납', value: 'pending' },
        { text: '부분납부', value: 'partial' },
        { text: '완납', value: 'completed' },
        { text: '면제', value: 'exempt' },
      ],
      onFilter: (value, record) => record.paymentStatus === value,
    },
    {
      title: '납부 금액',
      key: 'paidAmount',
      render: (_, record) => `₩${record.paidAmount.toLocaleString()}`,
      sorter: (a, b) => a.paidAmount - b.paidAmount,
    },
    {
      title: '잔여 금액',
      key: 'remainingAmount',
      render: (_, record) => `₩${record.remainingAmount.toLocaleString()}`,
      sorter: (a, b) => a.remainingAmount - b.remainingAmount,
    },
    {
      title: '납부일자',
      key: 'paidAt',
      render: (_, record) => record.paidAt ? new Date(record.paidAt).toLocaleDateString() : '-',
      sorter: (a, b) => {
        if (!a.paidAt && !b.paidAt) return 0;
        if (!a.paidAt) return 1;
        if (!b.paidAt) return -1;
        return new Date(a.paidAt).getTime() - new Date(b.paidAt).getTime();
      },
    },
    {
      title: '출석률',
      key: 'attendanceRate',
      render: (_, record) => {
        const rate = record.attendanceRate;
        let color = 'green';
        if (rate < 50) color = 'red';
        else if (rate < 80) color = 'orange';

        return (
          <div>
            <Tag color={color}>{rate.toFixed(1)}%</Tag>
            <div style={{ fontSize: '12px', color: token.colorTextSecondary }}>
              출석 {record.presentCount} / 지각 {record.lateCount} / 총 {record.totalSessions}회
            </div>
          </div>
        );
      },
      filters: [
        { text: '우수 (80%+)', value: 'excellent' },
        { text: '보통 (50-80%)', value: 'normal' },
        { text: '주의 (50% 미만)', value: 'warning' },
      ],
      onFilter: (value, record) => {
        if (value === 'excellent') return record.attendanceRate >= 80;
        if (value === 'normal') return record.attendanceRate >= 50 && record.attendanceRate < 80;
        if (value === 'warning') return record.attendanceRate < 50;
        return true;
      },
      sorter: (a, b) => a.attendanceRate - b.attendanceRate,
    },
    {
      title: '등록일',
      key: 'enrolledAt',
      render: (_, record) => new Date(record.enrolledAt).toLocaleDateString(),
      sorter: (a, b) => new Date(a.enrolledAt).getTime() - new Date(b.enrolledAt).getTime(),
    },
    {
      title: '작업',
      key: 'action',
      render: (_, record) => (
        <Space size="small">
          <Button type="link" onClick={() => handlePaymentEdit(record)}>
            납부 관리
          </Button>
          <Popconfirm
            title="정말 이 수강생을 제거하시겠습니까?"
            onConfirm={() => handleRemoveStudent(record.id)}
            okText="제거"
            cancelText="취소"
          >
            <Button type="link" danger>
              제거
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const selectedEnrollments = enrolledStudents.filter((student) =>
    selectedRowKeys.includes(student.id)
  );

  const rowSelection = {
    selectedRowKeys,
    onChange: (newSelectedRowKeys: React.Key[]) => {
      setSelectedRowKeys(newSelectedRowKeys);
    },
  };

  const tabItems = [
    {
      key: '1',
      label: '수강생 목록',
      children: (
        <div>
          {selectedRowKeys.length > 0 && (
            <div style={{ marginBottom: 16, padding: 12, backgroundColor: token.colorInfoBg, borderRadius: 4 }}>
              <Space>
                <span>{selectedRowKeys.length}명 선택됨</span>
                <Button
                  type="primary"
                  onClick={() => setIsBulkPaymentModalVisible(true)}
                >
                  일괄 납부 처리
                </Button>
                <Button onClick={() => setSelectedRowKeys([])}>선택 해제</Button>
              </Space>
            </div>
          )}
          <Table
            columns={columns}
            dataSource={enrolledStudents}
            rowKey="id"
            pagination={false}
            size="small"
            rowSelection={rowSelection}
          />
        </div>
      ),
    },
    {
      key: '2',
      label: '출석부',
      children: <AttendanceSheet courseId={id} onExport={handleExportAttendance} />,
    },
  ];

  return (
    <div>
      <Button
        icon={<ArrowLeftOutlined />}
        onClick={() => navigate('/courses')}
        style={{ marginBottom: 16 }}
      >
        강좌 목록으로
      </Button>

      {/* 강좌명 크게 표시 */}
      <Typography.Title level={2} style={{ marginTop: 16, marginBottom: 8 }}>
        {course.name}
      </Typography.Title>

      {/* 부가 정보 한 줄로 */}
      <Space split={<span style={{ color: '#d9d9d9' }}>·</span>} style={{ marginBottom: 24 }}>
        <span>강사: {course.instructorName}</span>
        <span>강의실: {course.classroom}</span>
        <span>수강료: ₩{course.fee.toLocaleString()}</span>
        <span>정원: {courseEnrollments.length}/{course.maxStudents}명</span>
      </Space>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="수강생 수"
              value={courseEnrollments.length}
              prefix={<UserOutlined />}
              suffix={`/ ${course.maxStudents}`}
            />
            <Progress
              percent={(courseEnrollments.length / course.maxStudents) * 100}
              format={(percent) => `${percent?.toFixed(2)}%`}
              size="small"
              style={{ marginTop: 8 }}
            />
          </Card>
        </Col>
        <Col span={6}>
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
        <Col span={6}>
          <Card>
            <Statistic
              title="예상 수익"
              value={expectedRevenue}
              prefix={<DollarOutlined />}
              suffix="원"
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="완납률"
              value={nonExemptEnrollments.length > 0 ? (completedPayments / nonExemptEnrollments.length) * 100 : 0}
              precision={1}
              suffix="%"
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: '#cf1322' }}
            />
          </Card>
        </Col>
      </Row>

      <Tabs items={tabItems} />

      <PaymentForm
        visible={isPaymentModalVisible}
        onClose={() => {
          setIsPaymentModalVisible(false);
          setSelectedEnrollment(null);
        }}
        enrollment={selectedEnrollment}
        courseFee={course.fee}
      />

      <BulkPaymentForm
        visible={isBulkPaymentModalVisible}
        onClose={() => {
          setIsBulkPaymentModalVisible(false);
          setSelectedRowKeys([]);
        }}
        enrollments={selectedEnrollments}
        courseFee={course.fee}
      />
    </div>
  );
};

export default CourseDetailPage;
