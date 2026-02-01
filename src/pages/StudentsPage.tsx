import React, { useState, useEffect } from 'react';
import { Button, Space, Typography, Dropdown, message } from 'antd';
import { PlusOutlined, DownloadOutlined } from '@ant-design/icons';
import type { MenuProps } from 'antd';
import StudentList from '../components/students/StudentList';
import StudentForm from '../components/students/StudentForm';
import { useStudentStore } from '../stores/studentStore';
import { useEnrollmentStore } from '../stores/enrollmentStore';
import { useCourseStore } from '../stores/courseStore';
import { exportStudentsToExcel, exportStudentsToCSV } from '../utils/export';

const { Title } = Typography;

const StudentsPage: React.FC = () => {
  const [isModalVisible, setIsModalVisible] = useState(false);
  const { students, loadStudents } = useStudentStore();
  const { enrollments, loadEnrollments } = useEnrollmentStore();
  const { courses, loadCourses } = useCourseStore();

  useEffect(() => {
    loadStudents();
    loadEnrollments();
    loadCourses();
  }, [loadStudents, loadEnrollments, loadCourses]);

  const handleExport = (type: 'excel' | 'csv-utf8' | 'csv-euckr') => {
    if (students.length === 0) {
      message.warning('내보낼 수강생 데이터가 없습니다');
      return;
    }

    try {
      switch (type) {
        case 'excel':
          exportStudentsToExcel(students, enrollments, courses);
          message.success('Excel 파일이 다운로드되었습니다');
          break;
        case 'csv-utf8':
          exportStudentsToCSV(students, enrollments, courses, 'utf-8');
          message.success('CSV 파일(UTF-8)이 다운로드되었습니다');
          break;
        case 'csv-euckr':
          exportStudentsToCSV(students, enrollments, courses, 'euc-kr');
          message.success('CSV 파일(EUC-KR)이 다운로드되었습니다');
          break;
      }
    } catch (error) {
      message.error('파일 내보내기에 실패했습니다');
    }
  };

  const exportMenuItems: MenuProps['items'] = [
    {
      key: 'excel',
      label: 'Excel 파일 (.xlsx)',
      onClick: () => handleExport('excel'),
    },
    {
      key: 'csv-utf8',
      label: 'CSV 파일 (UTF-8)',
      onClick: () => handleExport('csv-utf8'),
    },
    {
      key: 'csv-euckr',
      label: 'CSV 파일 (EUC-KR)',
      onClick: () => handleExport('csv-euckr'),
    },
  ];

  return (
    <div>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Title level={2}>수강생 관리</Title>
          <Space>
            <Dropdown menu={{ items: exportMenuItems }} placement="bottomRight">
              <Button icon={<DownloadOutlined />}>내보내기</Button>
            </Dropdown>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setIsModalVisible(true)}
            >
              수강생 등록
            </Button>
          </Space>
        </div>
        <StudentList />
      </Space>
      <StudentForm
        visible={isModalVisible}
        onClose={() => setIsModalVisible(false)}
        student={null}
      />
    </div>
  );
};

export default StudentsPage;
