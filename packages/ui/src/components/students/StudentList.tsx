import React, { useState, useMemo, useCallback } from 'react';
import { Table, Tag, Input, Select, Row, Col, Empty, Space, Tooltip, theme } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { SearchOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import type { Student } from '@tutomate/core';
import { useStudentStore } from '@tutomate/core';
import { appConfig } from '@tutomate/core';
import { useEnrollmentStore } from '@tutomate/core';
import { useCourseStore } from '@tutomate/core';
import StudentForm from './StudentForm';

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
  const { students } = useStudentStore();
  const { enrollments } = useEnrollmentStore();
  const { courses } = useCourseStore();
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [searchText, setSearchText] = useState('');
  const [searchField, setSearchField] = useState<string>('all');

  const handleEdit = useCallback((student: Student) => {
    setSelectedStudent(student);
    setIsModalVisible(true);
  }, []);

  const handleCloseStudentModal = useCallback(() => {
    setIsModalVisible(false);
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
      width: 40,
      render: (_, record) => record.index,
    },
    {
      title: '이름',
      key: 'name',
      sorter: (a, b) => a.student.name.localeCompare(b.student.name),
      render: (_, record) => (
        <a
          onClick={() => handleEdit(record.student)}
          style={{ whiteSpace: 'nowrap' }}
        >
          {record.student.name}
        </a>
      ),
    },
    ...(appConfig.enableMemberFeature ? [{
      title: '회원',
      key: 'isMember',
      filters: [{ text: '회원', value: true }, { text: '비회원', value: false }],
      onFilter: (value: unknown, record: StudentRow) => (record.student.isMember ?? false) === value,
      render: (_: unknown, record: StudentRow) => record.student.isMember
        ? <Tag color="blue">회원</Tag>
        : <Tag>비회원</Tag>,
    }] : []),
    {
      title: '전화번호',
      key: 'phone',
      render: (_, record) => <span style={{ whiteSpace: 'nowrap' }}>{record.student.phone}</span>,
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
    ...(!appConfig.hideAddressField ? [{
      title: '주소',
      key: 'address',
      ellipsis: { showTitle: false },
      render: (_: unknown, record: StudentRow) => record.student.address ? (
        <Tooltip title={record.student.address} placement="topLeft">
          <span>{record.student.address}</span>
        </Tooltip>
      ) : '-',
    }] : []),
    {
      title: '메모',
      key: 'notes',
      ellipsis: { showTitle: false },
      render: (_, record) => record.student.notes ? (
        <Tooltip title={record.student.notes} placement="topLeft">
          <span style={{ color: token.colorTextSecondary }}>{record.student.notes}</span>
        </Tooltip>
      ) : '-',
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
        tableLayout="auto"
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
    </>
  );
};

export default StudentList;
