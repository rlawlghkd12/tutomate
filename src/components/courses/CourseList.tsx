import React, { useState, useMemo, useCallback } from 'react';
import { Table, Button, Space, Tag, message, Progress, Input, Select, Row, Col, Modal, Empty } from 'antd';
import { ExclamationCircleOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { EditOutlined, DeleteOutlined, EyeOutlined, SearchOutlined } from '@ant-design/icons';
import type { Course } from '../../types';
import { useCourseStore } from '../../stores/courseStore';
import { useEnrollmentStore } from '../../stores/enrollmentStore';
import { useNavigate } from 'react-router-dom';
import CourseForm from './CourseForm';

const CourseList: React.FC = () => {
  const navigate = useNavigate();
  const { courses, deleteCourse } = useCourseStore();
  const { getEnrollmentCountByCourseId } = useEnrollmentStore();
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const handleEdit = useCallback((course: Course) => {
    setSelectedCourse(course);
    setIsModalVisible(true);
  }, []);

  const handleDelete = useCallback((course: Course) => {
    const currentStudents = getEnrollmentCountByCourseId(course.id);
    if (currentStudents > 0) {
      Modal.confirm({
        title: '⚠️ 수강생이 있는 강좌입니다!',
        icon: <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />,
        content: (
          <div>
            <p><strong>{course.name}</strong> 강좌에 현재 <strong style={{ color: '#ff4d4f' }}>{currentStudents}명</strong>의 수강생이 등록되어 있습니다.</p>
            <p style={{ marginTop: 8, color: '#ff4d4f' }}>삭제 시 해당 수강생들의 수강 기록도 함께 삭제됩니다.</p>
          </div>
        ),
        okText: '삭제',
        okType: 'danger',
        cancelText: '취소',
        onOk() {
          deleteCourse(course.id);
          message.success('강좌가 삭제되었습니다.');
        },
      });
    } else {
      Modal.confirm({
        title: '강좌를 삭제하시겠습니까?',
        icon: <ExclamationCircleOutlined />,
        content: `"${course.name}" 강좌를 삭제합니다.`,
        okText: '삭제',
        okType: 'danger',
        cancelText: '취소',
        onOk() {
          deleteCourse(course.id);
          message.success('강좌가 삭제되었습니다.');
        },
      });
    }
  }, [deleteCourse, getEnrollmentCountByCourseId]);

  const handleView = useCallback((id: string) => {
    navigate(`/courses/${id}`);
  }, [navigate]);

  const handleCloseModal = useCallback(() => {
    setIsModalVisible(false);
    setSelectedCourse(null);
  }, []);

  const getStatus = useCallback((course: Course) => {
    const currentStudents = getEnrollmentCountByCourseId(course.id);
    if (currentStudents >= course.maxStudents) {
      return 'full';
    } else if (currentStudents >= course.maxStudents * 0.8) {
      return 'almost';
    } else {
      return 'open';
    }
  }, [getEnrollmentCountByCourseId]);

  const filteredCourses = useMemo(() => {
    return courses.filter((course) => {
      const searchLower = searchText.toLowerCase();
      const matchesSearch =
        !searchText ||
        course.name.toLowerCase().includes(searchLower) ||
        course.instructorName.toLowerCase().includes(searchLower) ||
        course.classroom.toLowerCase().includes(searchLower);

      const matchesStatus = !statusFilter || getStatus(course) === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [courses, searchText, statusFilter, getStatus]);

  const columns: ColumnsType<Course> = [
    {
      title: '강좌 이름',
      dataIndex: 'name',
      key: 'name',
      sorter: (a, b) => a.name.localeCompare(b.name),
      render: (name, record) => (
        <a onClick={() => handleView(record.id)} style={{ cursor: 'pointer' }}>
          {name}
        </a>
      ),
    },
    {
      title: '강의실',
      dataIndex: 'classroom',
      key: 'classroom',
    },
    {
      title: '강사',
      dataIndex: 'instructorName',
      key: 'instructorName',
    },
    {
      title: '강사 전화번호',
      dataIndex: 'instructorPhone',
      key: 'instructorPhone',
    },
    {
      title: '수강료',
      dataIndex: 'fee',
      key: 'fee',
      render: (fee: number) => `₩${fee.toLocaleString()}`,
      sorter: (a, b) => a.fee - b.fee,
    },
    {
      title: '수강 인원',
      key: 'students',
      render: (_, record) => {
        const currentStudents = getEnrollmentCountByCourseId(record.id);
        const percentage = (currentStudents / record.maxStudents) * 100;
        return (
          <Space direction="vertical" style={{ width: '100%' }}>
            <span>
              {currentStudents} / {record.maxStudents}
            </span>
            <Progress
              percent={percentage}
              size="small"
              status={percentage >= 100 ? 'exception' : 'normal'}
              showInfo={false}
            />
          </Space>
        );
      },
      sorter: (a, b) => getEnrollmentCountByCourseId(a.id) - getEnrollmentCountByCourseId(b.id),
    },
    {
      title: '상태',
      key: 'status',
      render: (_, record) => {
        const status = getStatus(record);
        if (status === 'full') {
          return <Tag color="red">정원 마감</Tag>;
        } else if (status === 'almost') {
          return <Tag color="orange">마감 임박</Tag>;
        } else {
          return <Tag color="green">모집 중</Tag>;
        }
      },
    },
    {
      title: '작업',
      key: 'action',
      render: (_, record) => (
        <Space size="small">
          <Button
            type="link"
            icon={<EyeOutlined />}
            onClick={() => handleView(record.id)}
          >
            상세
          </Button>
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            수정
          </Button>
          <Button
            type="link"
            danger
            icon={<DeleteOutlined />}
            onClick={() => handleDelete(record)}
          >
            삭제
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Input
            placeholder="강좌명, 강사명, 강의실 검색"
            prefix={<SearchOutlined />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            allowClear
          />
        </Col>
        <Col span={6}>
          <Select
            placeholder="상태 필터"
            value={statusFilter}
            onChange={setStatusFilter}
            allowClear
            style={{ width: '100%' }}
          >
            <Select.Option value="open">모집 중</Select.Option>
            <Select.Option value="almost">마감 임박</Select.Option>
            <Select.Option value="full">정원 마감</Select.Option>
          </Select>
        </Col>
        <Col>
          <span style={{ color: '#888' }}>
            {filteredCourses.length}개
          </span>
        </Col>
      </Row>
      <Table
        columns={columns}
        dataSource={filteredCourses}
        rowKey="id"
        pagination={false}
        size="small"
        locale={{
          emptyText: (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={courses.length === 0 ? "등록된 강좌가 없습니다" : "검색 결과가 없습니다"}
            />
          ),
        }}
      />
      <CourseForm
        visible={isModalVisible}
        onClose={handleCloseModal}
        course={selectedCourse}
      />
    </>
  );
};

export default CourseList;
