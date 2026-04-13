import React, { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@tutomate/ui';
import { CourseList, CourseForm, PageEnter } from '@tutomate/ui';
import { useCourseStore, getCurrentQuarter, getQuarterOptions } from '@tutomate/core';

const CoursesPage: React.FC = () => {
  const [isModalVisible, setIsModalVisible] = useState(false);
  const { loadCourses } = useCourseStore();
  const [selectedQuarter, setSelectedQuarter] = useState(getCurrentQuarter());

  useEffect(() => {
    loadCourses();
  }, [loadCourses]);

  return (
    <PageEnter>
      <CourseList
        selectedQuarter={selectedQuarter}
        quarterSelector={
          <Select value={selectedQuarter} onValueChange={setSelectedQuarter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {getQuarterOptions().map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
        actions={
          <Button onClick={() => setIsModalVisible(true)}>
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
    </PageEnter>
  );
};

export default CoursesPage;
