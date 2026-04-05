import React, { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../components/ui/button';
import { CourseList, CourseForm } from '@tutomate/ui';
import { useCourseStore } from '@tutomate/core';

const CoursesPage: React.FC = () => {
  const [isModalVisible, setIsModalVisible] = useState(false);
  const { loadCourses } = useCourseStore();

  useEffect(() => {
    loadCourses();
  }, [loadCourses]);

  return (
    <div className="page-enter">
      <CourseList
        actions={
          <Button
            onClick={() => setIsModalVisible(true)}
          >
            <Plus className="h-4 w-4" />
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
