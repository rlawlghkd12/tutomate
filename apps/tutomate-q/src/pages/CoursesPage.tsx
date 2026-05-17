import React, { useState, useEffect, useMemo } from 'react';
import { Plus } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@tutomate/ui';
import { CourseList, CourseForm, PageEnter } from '@tutomate/ui';
import { useCourseStore, useEnrollmentStore, getCurrentQuarter, getQuarterLabel } from '@tutomate/core';

const QUARTER_STORAGE_KEY = 'courses:selectedQuarter';

const CoursesPage: React.FC = () => {
  const [isModalVisible, setIsModalVisible] = useState(false);
  const { loadCourses } = useCourseStore();
  const { enrollments, loadEnrollments } = useEnrollmentStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedQuarter = searchParams.get('q')
    || sessionStorage.getItem(QUARTER_STORAGE_KEY)
    || getCurrentQuarter();

  // 등록된 수강이 있는 분기만 옵션으로 노출 (현재 분기 + 선택된 분기는 항상 포함)
  const quarterOptions = useMemo(() => {
    const used = new Set<string>();
    for (const e of enrollments) {
      if (e.quarter && /^\d{4}-Q[1-4]$/.test(e.quarter)) used.add(e.quarter);
    }
    used.add(getCurrentQuarter());
    used.add(selectedQuarter);
    return Array.from(used)
      .sort((a, b) => a.localeCompare(b))
      .map((value) => ({ value, label: getQuarterLabel(value) }));
  }, [enrollments, selectedQuarter]);

  // URL과 sessionStorage 동기화 (뒤로가기로 진입 시 sessionStorage → URL 복원)
  useEffect(() => {
    const urlQuarter = searchParams.get('q');
    if (!urlQuarter) {
      setSearchParams({ q: selectedQuarter }, { replace: true });
    } else {
      sessionStorage.setItem(QUARTER_STORAGE_KEY, urlQuarter);
    }
  }, [searchParams, selectedQuarter, setSearchParams]);

  const setSelectedQuarter = (quarter: string) => {
    sessionStorage.setItem(QUARTER_STORAGE_KEY, quarter);
    setSearchParams({ q: quarter }, { replace: true });
  };

  useEffect(() => {
    loadCourses();
    loadEnrollments();
  }, [loadCourses, loadEnrollments]);

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
              {quarterOptions.map((opt) => (
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
