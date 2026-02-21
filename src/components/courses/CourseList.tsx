import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Table, Button, Space, Tag, message, Progress, Input, Select, Row, Col, Modal, Empty, Dropdown, theme } from 'antd';
import { ExclamationCircleOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { EditOutlined, DeleteOutlined, EyeOutlined, SearchOutlined, MoreOutlined } from '@ant-design/icons';
import type { Course } from '../../types';
import { useCourseStore } from '../../stores/courseStore';
import { useEnrollmentStore } from '../../stores/enrollmentStore';
import { useNavigate } from 'react-router-dom';
import CourseForm from './CourseForm';

interface CourseListProps {
  actions?: React.ReactNode;
}

const CourseList: React.FC<CourseListProps> = ({ actions }) => {
  const { token } = theme.useToken();
  const navigate = useNavigate();
  const { courses, deleteCourse } = useCourseStore();
  const { getEnrollmentCountByCourseId } = useEnrollmentStore();
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [searchText, setSearchText] = useState('');
  const [searchField, setSearchField] = useState<string>('all');
  const [isCompact, setIsCompact] = useState(() => window.innerWidth < 1080);

  useEffect(() => {
    const onResize = () => setIsCompact(window.innerWidth < 1080);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const handleEdit = useCallback((course: Course) => {
    setSelectedCourse(course);
    setIsModalVisible(true);
  }, []);

  const handleDelete = useCallback((course: Course) => {
    const currentStudents = getEnrollmentCountByCourseId(course.id);
    if (currentStudents > 0) {
      Modal.confirm({
        title: '⚠️ 수강생이 있는 강좌입니다!',
        icon: <ExclamationCircleOutlined style={{ color: token.colorError }} />,
        content: (
          <div>
            <p><strong>{course.name}</strong> 강좌에 현재 <strong style={{ color: token.colorError }}>{currentStudents}명</strong>의 수강생이 등록되어 있습니다.</p>
            <p style={{ marginTop: 8, color: token.colorError }}>삭제 시 해당 수강생들의 수강 기록도 함께 삭제됩니다.</p>
          </div>
        ),
        okText: '삭제',
        okType: 'danger',
        cancelText: '취소',
        async onOk() {
          await deleteCourse(course.id);
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
        async onOk() {
          await deleteCourse(course.id);
          message.success('강좌가 삭제되었습니다.');
        },
      });
    }
  }, [deleteCourse, getEnrollmentCountByCourseId, token]);

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
      if (!searchText) return true;
      const searchLower = searchText.toLowerCase();
      switch (searchField) {
        case 'name':
          return course.name.toLowerCase().includes(searchLower);
        case 'classroom':
          return course.classroom.toLowerCase().includes(searchLower);
        case 'instructor':
          return course.instructorName.toLowerCase().includes(searchLower);
        case 'instructorPhone':
          return course.instructorPhone.includes(searchText);
        default:
          return (
            course.name.toLowerCase().includes(searchLower) ||
            course.classroom.toLowerCase().includes(searchLower) ||
            course.instructorName.toLowerCase().includes(searchLower) ||
            course.instructorPhone.includes(searchText)
          );
      }
    });
  }, [courses, searchText, searchField]);

  const columns: ColumnsType<Course> = useMemo(() => [
    {
      title: 'No.',
      key: 'index',
      width: 50,
      render: (_, __, index) => index + 1,
    },
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
          <div style={{ lineHeight: 1.2 }}>
            <span>{currentStudents} / {record.maxStudents}</span>
            <Progress
              percent={percentage}
              size="small"
              status={percentage >= 100 ? 'exception' : 'normal'}
              showInfo={false}
              style={{ marginTop: 2, marginBottom: 0 }}
            />
          </div>
        );
      },
      sorter: (a, b) => getEnrollmentCountByCourseId(a.id) - getEnrollmentCountByCourseId(b.id),
    },
    {
      title: '상태',
      key: 'status',
      filters: [
        { text: '모집 중', value: 'open' },
        { text: '마감 임박', value: 'almost' },
        { text: '정원 마감', value: 'full' },
      ],
      onFilter: (value, record) => getStatus(record) === value,
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
      align: 'right' as const,
      render: (_, record) => isCompact ? (
        <Dropdown
          menu={{
            items: [
              { key: 'view', label: '상세', icon: <EyeOutlined />, onClick: () => handleView(record.id) },
              { key: 'edit', label: '수정', icon: <EditOutlined />, onClick: () => handleEdit(record) },
              { type: 'divider' },
              { key: 'delete', label: '삭제', icon: <DeleteOutlined />, danger: true, onClick: () => handleDelete(record) },
            ],
          }}
          trigger={['click']}
        >
          <Button type="text" icon={<MoreOutlined />} />
        </Dropdown>
      ) : (
        <Space size="small">
          <Button type="link" icon={<EyeOutlined />} onClick={() => handleView(record.id)}>상세</Button>
          <Button type="link" icon={<EditOutlined />} onClick={() => handleEdit(record)}>수정</Button>
          <Button type="link" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record)}>삭제</Button>
        </Space>
      ),
    },
  ], [handleView, handleEdit, handleDelete, getEnrollmentCountByCourseId, getStatus, isCompact]);

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
            <Select.Option value="name">강좌명</Select.Option>
            <Select.Option value="classroom">강의실</Select.Option>
            <Select.Option value="instructor">강사명</Select.Option>
            <Select.Option value="instructorPhone">전화번호</Select.Option>
          </Select>
        </Col>
        <Col flex="auto" style={{ maxWidth: 300 }}>
          <Input
            placeholder={
              searchField === 'name' ? '강좌명 검색' :
              searchField === 'classroom' ? '강의실 검색' :
              searchField === 'instructor' ? '강사명 검색' :
              searchField === 'instructorPhone' ? '전화번호 검색' :
              '강좌명, 강의실, 강사명, 전화번호 검색'
            }
            prefix={<SearchOutlined />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            allowClear
          />
        </Col>
        {actions && <Col flex="auto" style={{ textAlign: 'right' }}>{actions}</Col>}
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
