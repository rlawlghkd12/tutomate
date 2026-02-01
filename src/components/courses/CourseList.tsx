import React, { useState } from 'react';
import { Table, Button, Space, Popconfirm, Tag, message, Progress } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { EditOutlined, DeleteOutlined, EyeOutlined } from '@ant-design/icons';
import type { Course } from '../../types';
import { useCourseStore } from '../../stores/courseStore';
import { useNavigate } from 'react-router-dom';
import CourseForm from './CourseForm';

const CourseList: React.FC = () => {
  const navigate = useNavigate();
  const { courses, deleteCourse } = useCourseStore();
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);

  const handleEdit = (course: Course) => {
    setSelectedCourse(course);
    setIsModalVisible(true);
  };

  const handleDelete = (id: string) => {
    deleteCourse(id);
    message.success('강좌가 삭제되었습니다.');
  };

  const handleView = (id: string) => {
    navigate(`/courses/${id}`);
  };

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
        const percentage = (record.currentStudents / record.maxStudents) * 100;
        return (
          <Space direction="vertical" style={{ width: '100%' }}>
            <span>
              {record.currentStudents} / {record.maxStudents}
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
      sorter: (a, b) => a.currentStudents - b.currentStudents,
    },
    {
      title: '상태',
      key: 'status',
      render: (_, record) => {
        if (record.currentStudents >= record.maxStudents) {
          return <Tag color="red">정원 마감</Tag>;
        } else if (record.currentStudents >= record.maxStudents * 0.8) {
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
          <Popconfirm
            title="정말 삭제하시겠습니까?"
            onConfirm={() => handleDelete(record.id)}
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
      <Table
        columns={columns}
        dataSource={courses}
        rowKey="id"
        pagination={{ pageSize: 10 }}
      />
      <CourseForm
        visible={isModalVisible}
        onClose={() => {
          setIsModalVisible(false);
          setSelectedCourse(null);
        }}
        course={selectedCourse}
      />
    </>
  );
};

export default CourseList;
