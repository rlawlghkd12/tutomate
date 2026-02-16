import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Empty } from 'antd';
import type { Enrollment, Course } from '../../types';
import { useChartColors, useChartTooltipStyle, FLEX_CENTER } from '../../config/styles';

interface CourseRevenueChartProps {
  enrollments: Enrollment[];
  courses: Course[];
}

export const CourseRevenueChart: React.FC<CourseRevenueChartProps> = ({ enrollments, courses }) => {
  const chartColors = useChartColors();
  const tooltip = useChartTooltipStyle();

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

  if (courseData.length === 0) {
    return (
      <div style={{ ...FLEX_CENTER, height: 300 }}>
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="수익 데이터가 없습니다" />
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={courseData}>
        <CartesianGrid strokeDasharray="3 3" stroke={chartColors.border} />
        <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} stroke={chartColors.text} />
        <YAxis stroke={chartColors.text} />
        <Tooltip
          formatter={(value: number) => `₩${value.toLocaleString()}`}
          contentStyle={tooltip.contentStyle}
          labelStyle={tooltip.labelStyle}
        />
        <Legend wrapperStyle={{ color: chartColors.text }} />
        <Bar dataKey="수익" fill={chartColors.success} />
        <Bar dataKey="예상수익" fill={chartColors.primary} />
      </BarChart>
    </ResponsiveContainer>
  );
};
