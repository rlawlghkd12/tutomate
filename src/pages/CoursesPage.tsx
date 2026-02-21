import React, { useState, useEffect } from 'react';
import { Button } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import CourseList from '../components/courses/CourseList';
import CourseForm from '../components/courses/CourseForm';
import { useCourseStore } from '../stores/courseStore';

const CoursesPage: React.FC = () => {
  const [isModalVisible, setIsModalVisible] = useState(false);
  const { loadCourses } = useCourseStore();

  useEffect(() => {
    loadCourses();
  }, [loadCourses]);

  return (
    <div>
      <CourseList
        actions={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setIsModalVisible(true)}
          >
            강좌 개설
          </Button>
        }
      />
      <CourseForm
        visible={isModalVisible}
        onClose={() => setIsModalVisible(false)}
        course={null}
      />
    </div>
  );
};

export default CoursesPage;
