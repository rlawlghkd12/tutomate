import React, { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import type { Enrollment, Course } from '../../types';
import dayjs from 'dayjs';

interface MonthlyRevenueChartProps {
  enrollments: Enrollment[];
  courses: Course[];
}

export const MonthlyRevenueChart: React.FC<MonthlyRevenueChartProps> = ({ enrollments, courses }) => {
  const monthlyData = useMemo(() => {
    // 최근 6개월 데이터 생성
    const months: string[] = [];
    for (let i = 5; i >= 0; i--) {
      months.push(dayjs().subtract(i, 'month').format('YYYY-MM'));
    }

    return months.map((month) => {
      const monthEnrollments = enrollments.filter((e) =>
        dayjs(e.enrolledAt).format('YYYY-MM') === month
      );

      const revenue = monthEnrollments.reduce((sum, e) => sum + e.paidAmount, 0);
      const expectedRevenue = monthEnrollments.reduce((sum, e) => {
        const course = courses.find((c) => c.id === e.courseId);
        return sum + (course?.fee || 0);
      }, 0);

      return {
        month: dayjs(month).format('M월'),
        수익: revenue,
        예상수익: expectedRevenue,
      };
    });
  }, [enrollments, courses]);

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={monthlyData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="month" />
        <YAxis />
        <Tooltip formatter={(value: number) => `₩${value.toLocaleString()}`} />
        <Legend />
        <Line type="monotone" dataKey="수익" stroke="#3f8600" strokeWidth={2} />
        <Line type="monotone" dataKey="예상수익" stroke="#1890ff" strokeWidth={2} strokeDasharray="5 5" />
      </LineChart>
    </ResponsiveContainer>
  );
};
