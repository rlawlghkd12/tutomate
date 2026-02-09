import React, { useState, useMemo } from 'react';
import { Table, Button, Space, Popconfirm, message, Tag, Input, Select, Row, Col, Empty } from 'antd';
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
  student: Student;
  courseId: string | null;
  courseName: string | null;
}

const StudentList: React.FC = () => {
  const navigate = useNavigate();
  const { students, deleteStudent } = useStudentStore();
  const { enrollments } = useEnrollmentStore();
  const { courses } = useCourseStore();
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isEnrollmentModalVisible, setIsEnrollmentModalVisible] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [searchText, setSearchText] = useState('');
  const [courseFilter, setCourseFilter] = useState<string | null>(null);

  const handleEdit = (student: Student) => {
    setSelectedStudent(student);
    setIsModalVisible(true);
  };

  const handleDelete = (id: string) => {
    deleteStudent(id);
    message.success('수강생이 삭제되었습니다.');
  };

  const handleEnroll = (student: Student) => {
    setSelectedStudent(student);
    setIsEnrollmentModalVisible(true);
  };

  // 학생-강좌 조합으로 행 생성
  const studentRows = useMemo(() => {
    const rows: StudentRow[] = [];

    students.forEach((student) => {
      const studentEnrollments = enrollments.filter((e) => e.studentId === student.id);

      if (studentEnrollments.length === 0) {
        // 강좌가 없는 학생
        rows.push({
          rowKey: student.id,
          student,
          courseId: null,
          courseName: null,
        });
      } else {
        // 각 강좌별로 행 생성
        studentEnrollments.forEach((enrollment) => {
          const course = courses.find((c) => c.id === enrollment.courseId);
          rows.push({
            rowKey: `${student.id}-${enrollment.courseId}`,
            student,
            courseId: enrollment.courseId,
            courseName: course?.name || null,
          });
        });
      }
    });

    return rows;
  }, [students, enrollments, courses]);

  // 필터링
  const filteredRows = useMemo(() => {
    return studentRows.filter((row) => {
      const searchLower = searchText.toLowerCase();
      const matchesSearch =
        !searchText ||
        row.student.name.toLowerCase().includes(searchLower) ||
        row.student.phone.includes(searchText) ||
        (row.student.email && row.student.email.toLowerCase().includes(searchLower));

      const matchesCourse = !courseFilter || row.courseId === courseFilter;

      return matchesSearch && matchesCourse;
    });
  }, [studentRows, searchText, courseFilter]);

  const columns: ColumnsType<StudentRow> = [
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
      key: 'course',
      render: (_, record) => {
        if (!record.courseId) {
          return <span style={{ color: '#999' }}>-</span>;
        }
        return (
          <Tag
            color="blue"
            style={{ cursor: 'pointer' }}
            onClick={() => navigate(`/courses/${record.courseId}`)}
          >
            {record.courseName}
          </Tag>
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
          <span style={{ color: '#888' }}>
            {filteredRows.length}건
          </span>
        </Col>
      </Row>
      <Table
        columns={columns}
        dataSource={filteredRows}
        rowKey="rowKey"
        pagination={false}
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
        onClose={() => {
          setIsModalVisible(false);
          setSelectedStudent(null);
        }}
        student={selectedStudent}
      />
      <EnrollmentForm
        visible={isEnrollmentModalVisible}
        onClose={() => {
          setIsEnrollmentModalVisible(false);
          setSelectedStudent(null);
        }}
        student={selectedStudent}
      />
    </>
  );
};

export default StudentList;
