import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Empty } from 'antd';
import type { Enrollment, Course } from '../../types';
import { useSettingsStore } from '../../stores/settingsStore';

interface CourseRevenueChartProps {
  enrollments: Enrollment[];
  courses: Course[];
}

export const CourseRevenueChart: React.FC<CourseRevenueChartProps> = ({ enrollments, courses }) => {
  const { theme } = useSettingsStore();
  const isDark = theme === 'dark';

  const courseData = useMemo(() => {
    return courses
      .map((course) => {
        const courseEnrollments = enrollments.filter((e) => e.courseId === course.id);
        const nonExemptEnrollments = courseEnrollments.filter((e) => e.paymentStatus !== 'exempt');
        const revenue = courseEnrollments.reduce((sum, e) => sum + e.paidAmount, 0);
        const expectedRevenue = nonExemptEnrollments.length * course.fee;

        return {
          name: course.name.length > 10 ? course.name.substring(0, 10) + '...' : course.name,
          수익: revenue,
          예상수익: expectedRevenue,
          학생수: courseEnrollments.length,
        };
      })
      .filter((course) => course.학생수 > 0)
      .sort((a, b) => b.수익 - a.수익)
      .slice(0, 8);
  }, [enrollments, courses]);

  const tooltipStyle = {
    backgroundColor: isDark ? '#1f1f1f' : '#fff',
    border: `1px solid ${isDark ? '#434343' : '#d9d9d9'}`,
    borderRadius: 6,
    color: isDark ? '#fff' : '#000',
  };

  if (courseData.length === 0) {
    return (
      <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="수익 데이터가 없습니다" />
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={courseData}>
        <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#434343' : '#e8e8e8'} />
        <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} stroke={isDark ? '#fff' : '#000'} />
        <YAxis stroke={isDark ? '#fff' : '#000'} />
        <Tooltip
          formatter={(value: number) => `₩${value.toLocaleString()}`}
          contentStyle={tooltipStyle}
          labelStyle={{ color: isDark ? '#fff' : '#000' }}
        />
        <Legend wrapperStyle={{ color: isDark ? '#fff' : '#000' }} />
        <Bar dataKey="수익" fill="#52c41a" />
        <Bar dataKey="예상수익" fill="#1890ff" />
      </BarChart>
    </ResponsiveContainer>
  );
};
