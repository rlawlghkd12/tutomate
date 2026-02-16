import React, { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import dayjs from 'dayjs';
import type { Enrollment, Course } from '../../types';
import { useChartColors, useChartTooltipStyle } from '../../config/styles';

interface MonthlyRevenueChartProps {
  enrollments: Enrollment[];
  courses: Course[];
}

export const MonthlyRevenueChart: React.FC<MonthlyRevenueChartProps> = ({ enrollments, courses }) => {
  const chartColors = useChartColors();
  const tooltip = useChartTooltipStyle();

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
        <CartesianGrid strokeDasharray="3 3" stroke={chartColors.border} />
        <XAxis dataKey="month" stroke={chartColors.text} />
        <YAxis stroke={chartColors.text} />
        <Tooltip formatter={(value: number) => `₩${value.toLocaleString()}`} contentStyle={tooltip.contentStyle} labelStyle={tooltip.labelStyle} />
        <Legend wrapperStyle={{ color: chartColors.text }} />
        <Line type="monotone" dataKey="수익" stroke={chartColors.success} strokeWidth={2} />
        <Line type="monotone" dataKey="예상수익" stroke={chartColors.primary} strokeWidth={2} strokeDasharray="5 5" />
      </LineChart>
    </ResponsiveContainer>
  );
};
