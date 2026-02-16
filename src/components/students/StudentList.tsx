import React, { useState, useMemo, useCallback } from 'react';
import { Table, Button, Space, Popconfirm, message, Tag, Input, Select, Row, Col, Empty, theme } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { EditOutlined, DeleteOutlined, PlusCircleOutlined, SearchOutlined } from '@ant-design/icons';
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

const StudentList: React.FC = () => {
  const { token } = theme.useToken();
  const navigate = useNavigate();
  const { students, deleteStudent } = useStudentStore();
  const { enrollments } = useEnrollmentStore();
  const { courses } = useCourseStore();
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isEnrollmentModalVisible, setIsEnrollmentModalVisible] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [searchText, setSearchText] = useState('');
  const [courseFilter, setCourseFilter] = useState<string | null>(null);

  const handleEdit = useCallback((student: Student) => {
    setSelectedStudent(student);
    setIsModalVisible(true);
  }, []);

  const handleDelete = useCallback((id: string) => {
    deleteStudent(id);
    message.success('수강생이 삭제되었습니다.');
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
      const searchLower = searchText.toLowerCase();
      const matchesSearch =
        !searchText ||
        row.student.name.toLowerCase().includes(searchLower) ||
        row.student.phone.includes(searchText) ||
        (row.student.email && row.student.email.toLowerCase().includes(searchLower));

      const matchesCourse = !courseFilter || row.courses.some((c) => c.id === courseFilter);

      return matchesSearch && matchesCourse;
    });

    // 필터링 후 인덱스 재부여
    return filtered.map((row, idx) => ({ ...row, index: idx + 1 }));
  }, [studentRows, searchText, courseFilter]);

  const columns: ColumnsType<StudentRow> = [
    {
      title: 'No.',
      key: 'index',
      width: 60,
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
      title: '이메일',
      key: 'email',
      render: (_, record) => record.student.email || '-',
    },
    {
      title: '강좌',
      key: 'courses',
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
      title: '작업',
      key: 'action',
      render: (_, record) => (
        <Space size="small">
          <Button
            type="link"
            icon={<PlusCircleOutlined />}
            onClick={() => handleEnroll(record.student)}
          >
            강좌 신청
          </Button>
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record.student)}
          >
            수정
          </Button>
          <Popconfirm
            title="정말 삭제하시겠습니까?"
            onConfirm={() => handleDelete(record.student.id)}
            okText="삭제"
            cancelText="취소"
          >
            <Button type="link" danger icon={<DeleteOutlined />}>
              삭제
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Input
            placeholder="이름, 전화번호, 이메일 검색"
            prefix={<SearchOutlined />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            allowClear
          />
        </Col>
        <Col span={6}>
          <Select
            placeholder="강좌 필터"
            value={courseFilter}
            onChange={setCourseFilter}
            allowClear
            style={{ width: '100%' }}
          >
            {courses.map((course) => (
              <Select.Option key={course.id} value={course.id}>
                {course.name}
              </Select.Option>
            ))}
          </Select>
        </Col>
        <Col>
          <span style={{ color: token.colorTextSecondary }}>
            {filteredRows.length}명
          </span>
        </Col>
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
