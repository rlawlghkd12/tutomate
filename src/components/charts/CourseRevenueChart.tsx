import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import type { Enrollment, Course } from '../../types';

interface CourseRevenueChartProps {
  enrollments: Enrollment[];
  courses: Course[];
}

export const CourseRevenueChart: React.FC<CourseRevenueChartProps> = ({ enrollments, courses }) => {
  const courseData = useMemo(() => {
    return courses
      .map((course) => {
        const courseEnrollments = enrollments.filter((e) => e.courseId === course.id);
        const revenue = courseEnrollments.reduce((sum, e) => sum + e.paidAmount, 0);
        const expectedRevenue = courseEnrollments.length * course.fee;

        return {
          name: course.name.length > 10 ? course.name.substring(0, 10) + '...' : course.name,
          수익: revenue,
          예상수익: expectedRevenue,
          학생수: courseEnrollments.length,
        };
      })
      .filter((course) => course.학생수 > 0) // 학생이 있는 강좌만
      .sort((a, b) => b.수익 - a.수익) // 수익 순으로 정렬
      .slice(0, 8); // 상위 8개만
  }, [enrollments, courses]);

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={courseData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
        <YAxis />
        <Tooltip formatter={(value: number) => `₩${value.toLocaleString()}`} />
        <Legend />
        <Bar dataKey="수익" fill="#3f8600" />
        <Bar dataKey="예상수익" fill="#1890ff" />
      </BarChart>
    </ResponsiveContainer>
  );
};
