import React, { useState, useEffect } from 'react';
import { Button, Space, Typography } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { FLEX_BETWEEN } from '../config/styles';
import CourseList from '../components/courses/CourseList';
import CourseForm from '../components/courses/CourseForm';
import { useCourseStore } from '../stores/courseStore';

const { Title } = Typography;

const CoursesPage: React.FC = () => {
  const [isModalVisible, setIsModalVisible] = useState(false);
  const { loadCourses } = useCourseStore();

  useEffect(() => {
    loadCourses();
  }, [loadCourses]);

  return (
    <div>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div style={FLEX_BETWEEN}>
          <Title level={2}>강좌 관리</Title>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setIsModalVisible(true)}
          >
            강좌 개설
          </Button>
        </div>
        <CourseList />
      </Space>
      <CourseForm
        visible={isModalVisible}
        onClose={() => setIsModalVisible(false)}
        course={null}
      />
    </div>
  );
};

export default CoursesPage;
