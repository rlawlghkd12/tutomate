import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Table, Button, Space, Modal, message, Tag, Input, Select, Row, Col, Empty, Dropdown, theme } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { EditOutlined, DeleteOutlined, PlusCircleOutlined, SearchOutlined, MoreOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import type { Student } from '../../types';
import { useStudentStore } from '../../stores/studentStore';
import { useEnrollmentStore } from '../../stores/enrollmentStore';
import { useCourseStore } from '../../stores/courseStore';
import StudentForm from './StudentForm';
import EnrollmentForm from './EnrollmentForm';

interface StudentRow {
  rowKey: string;
  index: number;
  student: Student;
  courses: { id: string; name: string }[];
}

interface StudentListProps {
  actions?: React.ReactNode;
}

const StudentList: React.FC<StudentListProps> = ({ actions }) => {
  const { token } = theme.useToken();
  const navigate = useNavigate();
  const { students, deleteStudent } = useStudentStore();
  const { enrollments } = useEnrollmentStore();
  const { courses } = useCourseStore();
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isEnrollmentModalVisible, setIsEnrollmentModalVisible] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [searchText, setSearchText] = useState('');
  const [searchField, setSearchField] = useState<string>('all');
  const [isCompact, setIsCompact] = useState(() => window.innerWidth < 1080);

  useEffect(() => {
    const onResize = () => setIsCompact(window.innerWidth < 1080);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const handleEdit = useCallback((student: Student) => {
    setSelectedStudent(student);
    setIsModalVisible(true);
  }, []);

  const handleDelete = useCallback((student: Student) => {
    Modal.confirm({
      title: '수강생을 삭제하시겠습니까?',
      icon: <ExclamationCircleOutlined />,
      content: `"${student.name}" 수강생을 삭제합니다.`,
      okText: '삭제',
      okType: 'danger',
      cancelText: '취소',
      async onOk() {
        await deleteStudent(student.id);
        message.success('수강생이 삭제되었습니다.');
      },
    });
  }, [deleteStudent]);

  const handleEnroll = useCallback((student: Student) => {
    setSelectedStudent(student);
    setIsEnrollmentModalVisible(true);
  }, []);

  const handleCloseStudentModal = useCallback(() => {
    setIsModalVisible(false);
    setSelectedStudent(null);
  }, []);

  const handleCloseEnrollmentModal = useCallback(() => {
    setIsEnrollmentModalVisible(false);
    setSelectedStudent(null);
  }, []);

  // 학생별로 행 생성 (강좌는 배열로)
  const studentRows = useMemo(() => {
    return students.map((student, index) => {
      const studentEnrollments = enrollments.filter((e) => e.studentId === student.id);
      const studentCourses = studentEnrollments
        .map((enrollment) => {
          const course = courses.find((c) => c.id === enrollment.courseId);
          return course ? { id: course.id, name: course.name } : null;
        })
        .filter((c): c is { id: string; name: string } => c !== null);

      return {
        rowKey: student.id,
        index: index + 1,
        student,
        courses: studentCourses,
      };
    });
  }, [students, enrollments, courses]);

  // 필터링
  const filteredRows = useMemo(() => {
    const filtered = studentRows.filter((row) => {
      if (!searchText) return true;
      const searchLower = searchText.toLowerCase();
      switch (searchField) {
        case 'name':
          return row.student.name.toLowerCase().includes(searchLower);
        case 'phone':
          return row.student.phone.includes(searchText);
        case 'course':
          return row.courses.some((c) => c.name.toLowerCase().includes(searchLower));
        case 'address':
          return (row.student.address || '').toLowerCase().includes(searchLower);
        case 'notes':
          return (row.student.notes || '').toLowerCase().includes(searchLower);
        default:
          return (
            row.student.name.toLowerCase().includes(searchLower) ||
            row.student.phone.includes(searchText) ||
            row.courses.some((c) => c.name.toLowerCase().includes(searchLower)) ||
            (row.student.address || '').toLowerCase().includes(searchLower) ||
            (row.student.notes || '').toLowerCase().includes(searchLower)
          );
      }
    });

    // 필터링 후 인덱스 재부여
    return filtered.map((row, idx) => ({ ...row, index: idx + 1 }));
  }, [studentRows, searchText, searchField]);

  const columns: ColumnsType<StudentRow> = [
    {
      title: 'No.',
      key: 'index',
      width: 50,
      render: (_, record) => record.index,
    },
    {
      title: '이름',
      key: 'name',
      sorter: (a, b) => a.student.name.localeCompare(b.student.name),
      render: (_, record) => record.student.name,
    },
    {
      title: '전화번호',
      key: 'phone',
      render: (_, record) => record.student.phone,
    },
    {
      title: '강좌',
      key: 'courses',
      filters: courses.map((c) => ({ text: c.name, value: c.id })),
      onFilter: (value, record) => record.courses.some((c) => c.id === value),
      render: (_, record) => {
        if (record.courses.length === 0) {
          return <span style={{ color: token.colorTextQuaternary }}>-</span>;
        }
        return (
          <Space size={[0, 4]} wrap>
            {record.courses.map((course) => (
              <Tag
                key={course.id}
                color="blue"
                style={{ cursor: 'pointer' }}
                onClick={() => navigate(`/courses/${course.id}`)}
              >
                {course.name}
              </Tag>
            ))}
          </Space>
        );
      },
    },
    {
      title: '주소',
      key: 'address',
      render: (_, record) => record.student.address || '-',
    },
    {
      title: '메모',
      key: 'notes',
      ellipsis: true,
      render: (_, record) => record.student.notes ? (
        <span style={{ color: token.colorTextSecondary }}>{record.student.notes}</span>
      ) : '-',
    },
    {
      title: '작업',
      key: 'action',
      align: 'right' as const,
      render: (_, record) => isCompact ? (
        <Dropdown
          menu={{
            items: [
              { key: 'enroll', label: '강좌 신청', icon: <PlusCircleOutlined />, onClick: () => handleEnroll(record.student) },
              { key: 'edit', label: '수정', icon: <EditOutlined />, onClick: () => handleEdit(record.student) },
              { type: 'divider' },
              { key: 'delete', label: '삭제', icon: <DeleteOutlined />, danger: true, onClick: () => handleDelete(record.student) },
            ],
          }}
          trigger={['click']}
        >
          <Button type="text" icon={<MoreOutlined />} />
        </Dropdown>
      ) : (
        <Space size="small">
          <Button type="link" icon={<PlusCircleOutlined />} onClick={() => handleEnroll(record.student)}>강좌 신청</Button>
          <Button type="link" icon={<EditOutlined />} onClick={() => handleEdit(record.student)}>수정</Button>
          <Button type="link" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record.student)}>삭제</Button>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col flex="none">
          <Select
            value={searchField}
            onChange={setSearchField}
            style={{ width: 110 }}
          >
            <Select.Option value="all">전체</Select.Option>
            <Select.Option value="name">이름</Select.Option>
            <Select.Option value="phone">전화번호</Select.Option>
            <Select.Option value="course">강좌</Select.Option>
            <Select.Option value="address">주소</Select.Option>
            <Select.Option value="notes">메모</Select.Option>
          </Select>
        </Col>
        <Col flex="auto" style={{ maxWidth: 300 }}>
          <Input
            placeholder={
              searchField === 'name' ? '이름 검색' :
              searchField === 'phone' ? '전화번호 검색' :
              searchField === 'course' ? '강좌명 검색' :
              searchField === 'address' ? '주소 검색' :
              searchField === 'notes' ? '메모 검색' :
              '이름, 전화번호, 강좌, 주소, 메모 검색'
            }
            prefix={<SearchOutlined />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            allowClear
          />
        </Col>
        {actions && (
          <Col flex="auto" style={{ textAlign: 'right' }}>
            {actions}
          </Col>
        )}
      </Row>
      <Table
        columns={columns}
        dataSource={filteredRows}
        rowKey="rowKey"
        pagination={false}
        size="small"
        locale={{
          emptyText: (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={students.length === 0 ? "등록된 수강생이 없습니다" : "검색 결과가 없습니다"}
            />
          ),
        }}
      />
      <StudentForm
        visible={isModalVisible}
        onClose={handleCloseStudentModal}
        student={selectedStudent}
      />
      <EnrollmentForm
        visible={isEnrollmentModalVisible}
        onClose={handleCloseEnrollmentModal}
        student={selectedStudent}
      />
    </>
  );
};

export default StudentList;
