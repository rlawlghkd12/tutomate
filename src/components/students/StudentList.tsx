import React, { useState } from 'react';
import { Table, Button, Space, Popconfirm, message, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { EditOutlined, DeleteOutlined, PlusCircleOutlined } from '@ant-design/icons';
import type { Student } from '../../types';
import { useStudentStore } from '../../stores/studentStore';
import { useEnrollmentStore } from '../../stores/enrollmentStore';
import StudentForm from './StudentForm';
import EnrollmentForm from './EnrollmentForm';

const StudentList: React.FC = () => {
  const { students, deleteStudent } = useStudentStore();
  const { enrollments } = useEnrollmentStore();
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isEnrollmentModalVisible, setIsEnrollmentModalVisible] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);

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

  const getEnrollmentCount = (studentId: string) => {
    return enrollments.filter((e) => e.studentId === studentId).length;
  };

  const columns: ColumnsType<Student> = [
    {
      title: '이름',
      dataIndex: 'name',
      key: 'name',
      sorter: (a, b) => a.name.localeCompare(b.name),
    },
    {
      title: '전화번호',
      dataIndex: 'phone',
      key: 'phone',
    },
    {
      title: '이메일',
      dataIndex: 'email',
      key: 'email',
    },
    {
      title: '수강 중인 강좌',
      key: 'enrollments',
      render: (_, record) => {
        const count = getEnrollmentCount(record.id);
        return <Tag color="blue">{count}개</Tag>;
      },
    },
    {
      title: '주소',
      dataIndex: 'address',
      key: 'address',
      render: (address) => address || '-',
    },
    {
      title: '작업',
      key: 'action',
      render: (_, record) => (
        <Space size="small">
          <Button
            type="link"
            icon={<PlusCircleOutlined />}
            onClick={() => handleEnroll(record)}
          >
            강좌 신청
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
        dataSource={students}
        rowKey="id"
        pagination={{ pageSize: 10 }}
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
