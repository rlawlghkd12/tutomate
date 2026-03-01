import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card,
  Table,
  Tabs,
  Tag,
  Button,
  Space,
  Progress,
  Statistic,
  Row,
  Col,
  message,
  Popconfirm,
  Typography,
  Modal,
  Checkbox,
  theme,
} from 'antd';

const { useToken } = theme;
import type { ColumnsType } from 'antd/es/table';
import {
  ArrowLeftOutlined,
  DollarOutlined,
  UserOutlined,
  CheckCircleOutlined,
  DownloadOutlined,
  FileExcelOutlined,
  FileTextOutlined,
  CalendarOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { useCourseStore } from '../stores/courseStore';
import { useStudentStore } from '../stores/studentStore';
import { useEnrollmentStore } from '../stores/enrollmentStore';
import type { Enrollment } from '../types';
import PaymentForm from '../components/payment/PaymentForm';
import BulkPaymentForm from '../components/payment/BulkPaymentForm';
import MonthlyPaymentTable from '../components/payment/MonthlyPaymentTable';
import { useMonthlyPaymentStore } from '../stores/monthlyPaymentStore';
import {
  exportCourseStudentsToExcel,
  exportCourseStudentsToCSV,
  COURSE_STUDENT_EXPORT_FIELDS,
} from '../utils/export';

const DEFAULT_EXPORT_FIELDS = ['name', 'phone', 'email', 'paymentStatus', 'paidAmount'];

const CourseDetailPage: React.FC = () => {
  const { token } = useToken();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getCourseById, loadCourses } = useCourseStore();
  const { loadStudents, getStudentById } = useStudentStore();
  const { enrollments, loadEnrollments, deleteEnrollment } = useEnrollmentStore();
  const { loadPayments } = useMonthlyPaymentStore();

  const [selectedEnrollment, setSelectedEnrollment] = useState<Enrollment | null>(null);
  const [isPaymentModalVisible, setIsPaymentModalVisible] = useState(false);
  const [isBulkPaymentModalVisible, setIsBulkPaymentModalVisible] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [isExportModalVisible, setIsExportModalVisible] = useState(false);
  const [selectedExportFields, setSelectedExportFields] = useState<string[]>(DEFAULT_EXPORT_FIELDS);

  const [activeTab, setActiveTab] = useState<string>('students');

  useEffect(() => {
    loadCourses();
    loadStudents();
    loadEnrollments();
    loadPayments();
  }, [loadCourses, loadStudents, loadEnrollments, loadPayments]);

  if (!id) {
    return <div>강좌를 찾을 수 없습니다.</div>;
  }

  const course = getCourseById(id);

  if (!course) {
    return <div>강좌를 찾을 수 없습니다.</div>;
  }

  const courseEnrollments = enrollments.filter((e) => e.courseId === id);

  const enrolledStudents = useMemo(() => {
    return courseEnrollments.map((enrollment) => {
      const student = getStudentById(enrollment.studentId);
      return {
        ...enrollment,
        student,
      };
    });
  }, [courseEnrollments, getStudentById]);

  const totalRevenue = courseEnrollments.reduce((sum, e) => sum + e.paidAmount, 0);
  const nonExemptEnrollments = courseEnrollments.filter(e => e.paymentStatus !== 'exempt');
  const expectedRevenue = nonExemptEnrollments.length * course.fee;
  const completedPayments = courseEnrollments.filter((e) => e.paymentStatus === 'completed').length;

  const handleRemoveStudent = async (enrollmentId: string) => {
    await deleteEnrollment(enrollmentId);
    message.success('수강생이 제거되었습니다.');
  };

  const handlePaymentEdit = (enrollment: Enrollment) => {
    setSelectedEnrollment(enrollment);
    setIsPaymentModalVisible(true);
  };

  const handleExport = (type: 'excel' | 'csv') => {
    if (selectedExportFields.length === 0) {
      message.warning('내보낼 필드를 1개 이상 선택해주세요.');
      return;
    }

    const data = enrolledStudents
      .filter((es) => es.student)
      .map((es) => ({ student: es.student!, enrollment: es as Enrollment }));

    if (data.length === 0) {
      message.warning('내보낼 수강생이 없습니다.');
      return;
    }

    try {
      if (type === 'excel') {
        exportCourseStudentsToExcel(course, data, selectedExportFields);
        message.success('Excel 파일이 다운로드되었습니다.');
      } else {
        exportCourseStudentsToCSV(course, data, selectedExportFields);
        message.success('CSV 파일이 다운로드되었습니다.');
      }
      setIsExportModalVisible(false);
    } catch {
      message.error('내보내기에 실패했습니다.');
    }
  };

  const allFieldKeys = COURSE_STUDENT_EXPORT_FIELDS.map((f) => f.key);
  const isAllSelected = selectedExportFields.length === allFieldKeys.length;

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
      title: '할인',
      key: 'discountAmount',
      render: (_, record) => (record.discountAmount ?? 0) > 0 ? <span style={{ color: token.colorSuccess }}>-₩{record.discountAmount.toLocaleString()}</span> : '-',
      sorter: (a, b) => (a.discountAmount ?? 0) - (b.discountAmount ?? 0),
    },
    {
      title: '납부 방법',
      key: 'paymentMethod',
      render: (_, record) => {
        if (!record.paymentMethod) return '-';
        const labels: Record<string, string> = { cash: '현금', card: '카드', transfer: '계좌이체' };
        return labels[record.paymentMethod] || '-';
      },
      filters: [
        { text: '현금', value: 'cash' },
        { text: '카드', value: 'card' },
        { text: '계좌이체', value: 'transfer' },
      ],
      onFilter: (value, record) => record.paymentMethod === value,
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

  return (
    <div>
      <Button
        icon={<ArrowLeftOutlined />}
        onClick={() => navigate('/courses')}
        style={{ marginBottom: 16 }}
      >
        강좌 목록으로
      </Button>

      {/* 강좌명 + 내보내기 버튼 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, marginBottom: 8 }}>
        <Typography.Title level={2} style={{ margin: 0 }}>
          {course.name}
        </Typography.Title>
        <Button
          icon={<DownloadOutlined />}
          onClick={() => setIsExportModalVisible(true)}
          disabled={courseEnrollments.length === 0}
        >
          내보내기
        </Button>
      </div>

      {/* 부가 정보 한 줄로 */}
      <Space split={<span style={{ color: token.colorBorder }}>·</span>} style={{ marginBottom: 24 }}>
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
              valueStyle={{ color: token.colorSuccess }}
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
              valueStyle={{ color: token.colorError }}
            />
          </Card>
        </Col>
      </Row>

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'students',
            label: <span><TeamOutlined /> 수강생 관리</span>,
            children: (
              <>
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
              </>
            ),
          },
          {
            key: 'monthly',
            label: <span><CalendarOutlined /> 월별 납부</span>,
            children: (
              <MonthlyPaymentTable
                courseId={id}
                courseFee={course.fee}
                enrollments={courseEnrollments}
              />
            ),
          },
        ]}
      />

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

      {/* 내보내기 모달 */}
      <Modal
        title="수강생 내보내기"
        open={isExportModalVisible}
        onCancel={() => setIsExportModalVisible(false)}
        width={320}
        styles={{ body: { paddingBottom: 24 } }}
        footer={null}
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
            checked={isAllSelected}
            indeterminate={selectedExportFields.length > 0 && !isAllSelected}
            onChange={(e) => setSelectedExportFields(e.target.checked ? allFieldKeys : [])}
          >
            전체 선택
          </Checkbox>
          <span style={{ fontSize: 12, color: token.colorTextTertiary }}>
            {selectedExportFields.length}/{allFieldKeys.length}
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 16 }}>
          {COURSE_STUDENT_EXPORT_FIELDS.map((field) => {
            const isChecked = selectedExportFields.includes(field.key);
            return (
              <div
                key={field.key}
                onClick={() => {
                  setSelectedExportFields((prev) =>
                    isChecked ? prev.filter((k: string) => k !== field.key) : [...prev, field.key]
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

export default CourseDetailPage;
