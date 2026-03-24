import React, { useState, useEffect } from 'react';
import { Button } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { CourseList, CourseForm } from '@tutomate/ui';
import { useCourseStore } from '@tutomate/core';

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
