import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Empty } from '../ui/empty';
import type { Enrollment, Course } from '@tutomate/core';
import { useChartColors, FLEX_CENTER } from '@tutomate/core';

interface CourseRevenueChartProps {
  enrollments: Enrollment[];
  courses: Course[];
}

const formatManWon = (value: number) => {
  if (value >= 10000) return `${Math.round(value / 10000)}만`;
  return value.toLocaleString();
};

export const CourseRevenueChart: React.FC<CourseRevenueChartProps> = ({ enrollments, courses }) => {
  const chartColors = useChartColors();

  const courseData = useMemo(() => {
    return courses
      .map((course) => {
        const courseEnrollments = enrollments.filter((e) => e.courseId === course.id);
        const nonExemptEnrollments = courseEnrollments.filter((e) => e.paymentStatus !== 'exempt');
        const revenue = nonExemptEnrollments.reduce((sum, e) => sum + e.paidAmount, 0);
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
        <Empty description="수익 데이터가 없습니다" />
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={courseData}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis
          dataKey="name"
          angle={-45}
          textAnchor="end"
          height={100}
          tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
          axisLine={{ stroke: 'hsl(var(--border))' }}
          tickLine={false}
        />
        <YAxis
          tickFormatter={formatManWon}
          tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          cursor={{ fill: chartColors.hoverFill }}
          content={({ active, payload, label }) => {
            if (!active || !payload) return null;
            return (
              <div style={{ background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: 8, padding: '10px 14px', fontSize: 13 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>
                {payload.map((p) => (
                  <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: p.color }} />
                    <span style={{ color: 'hsl(var(--muted-foreground))' }}>{p.name}:</span>
                    <span style={{ fontWeight: 500 }}>₩{p.value?.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            );
          }}
        />
        <Legend
          verticalAlign="bottom"
          wrapperStyle={{ paddingTop: 12, fontSize: 13, color: 'hsl(var(--muted-foreground))' }}
        />
        <Bar dataKey="수익" fill="#6366f1" radius={[4, 4, 0, 0]} />
        <Bar dataKey="예상수익" fill="#a5b4fc" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
};
