import React, { useState, useMemo, useCallback } from 'react';
import { Table, Tag, Progress, Input, Select, Row, Col, Empty, Tabs, Badge, theme } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { SearchOutlined } from '@ant-design/icons';
import type { Course } from '@tutomate/core';
import { useCourseStore } from '@tutomate/core';
import { useEnrollmentStore } from '@tutomate/core';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';

interface CourseListProps {
  actions?: React.ReactNode;
}

const CourseList: React.FC<CourseListProps> = ({ actions }) => {
  const { token } = theme.useToken();
  const navigate = useNavigate();
  const { courses } = useCourseStore();
  const { getEnrollmentCountByCourseId } = useEnrollmentStore();
  const [searchText, setSearchText] = useState('');
  const [searchField, setSearchField] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<string>('active');

  const handleView = useCallback((id: string) => {
    navigate(`/courses/${id}`);
  }, [navigate]);

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

  const isCourseEnded = useCallback((course: Course): boolean => {
    if (!course.schedule?.endDate) return false;
    return course.schedule.endDate < dayjs().format('YYYY-MM-DD');
  }, []);

  const activeCourses = useMemo(() => filteredCourses.filter(c => !isCourseEnded(c)), [filteredCourses, isCourseEnded]);
  const endedCourses = useMemo(() => filteredCourses.filter(c => isCourseEnded(c)), [filteredCourses, isCourseEnded]);
  const displayedCourses = activeTab === 'active' ? activeCourses : endedCourses;

  const columns: ColumnsType<Course> = useMemo(() => [
    {
      title: 'No.',
      key: 'index',
      width: 40,
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
          {isCourseEnded(record) && <Tag color="default" style={{ marginLeft: 8 }}>종료</Tag>}
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
  ], [handleView, getEnrollmentCountByCourseId, getStatus, isCourseEnded]);

  return (
    <>
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        style={{ marginBottom: 0, marginTop: -16 }}
        items={[
          {
            key: 'active',
            label: <span>현재 강좌 <Badge count={activeCourses.length} style={{ backgroundColor: token.colorPrimary, marginLeft: 4 }} /></span>,
          },
          {
            key: 'ended',
            label: <span>종료된 강좌 <Badge count={endedCourses.length} style={{ backgroundColor: token.colorTextDisabled, marginLeft: 4 }} /></span>,
          },
        ]}
      />
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
        dataSource={displayedCourses}
        rowKey="id"
        pagination={false}
        size="small"
        rowClassName={(record) => isCourseEnded(record) ? 'ended-course-row' : ''}
        locale={{
          emptyText: (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                courses.length === 0
                  ? "등록된 강좌가 없습니다"
                  : activeTab === 'ended'
                    ? "종료된 강좌가 없습니다"
                    : "검색 결과가 없습니다"
              }
            />
          ),
        }}
      />
    </>
  );
};

export default CourseList;
