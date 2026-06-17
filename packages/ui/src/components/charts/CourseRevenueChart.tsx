import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Empty } from '../ui/empty';
import type { Enrollment, Course } from '@tutomate/core';
import { useChartColors, FLEX_CENTER, isActiveEnrollment } from '@tutomate/core';

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
        const courseEnrollments = enrollments.filter((e) => isActiveEnrollment(e) && e.courseId === course.id);
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
      .sort((a, b) => b.수익 - a.수익);
  }, [enrollments, courses]);

  if (courseData.length === 0) {
    return (
      <div style={{ ...FLEX_CENTER, height: 300 }}>
        <Empty description="수익 데이터가 없습니다" />
      </div>
    );
  }

  const barHeight = 30;
  const chartHeight = Math.max(180, courseData.length * (barHeight + 16) + 44);
  // 강좌가 많아지면 카드가 끝없이 길어지는 것을 막는다: 일정 높이 이상이면 내부 스크롤.
  const MAX_HEIGHT = 320;

  return (
    <div style={{ maxHeight: MAX_HEIGHT, overflowY: chartHeight > MAX_HEIGHT ? 'auto' : 'visible' }}>
    <ResponsiveContainer width="100%" height={chartHeight}>
      <BarChart data={courseData} layout="vertical" margin={{ top: 8, right: 24, bottom: 8, left: 8 }} barCategoryGap={20}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
        <XAxis
          type="number"
          tickFormatter={formatManWon}
          tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: '0.79rem' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={120}
          tick={{ fill: 'hsl(var(--foreground))', fontSize: '0.86rem', fontWeight: 600 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          cursor={{ fill: chartColors.hoverFill }}
          content={({ active, payload, label }) => {
            if (!active || !payload) return null;
            return (
              <div style={{ background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: 8, padding: '10px 14px', fontSize: '0.86rem' }}>
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
          verticalAlign="top"
          align="right"
          iconType="square"
          wrapperStyle={{ paddingBottom: 12, fontSize: '0.86rem', color: 'hsl(var(--muted-foreground))' }}
          formatter={(value: string) => (
            <span style={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.86rem' }}>
              {value === '수익' ? '실제 납부' : '예상(목표)'}
            </span>
          )}
        />
        <Bar dataKey="예상수익" fill="hsl(240 6% 84%)" radius={[0, 6, 6, 0]} barSize={barHeight} />
        <Bar dataKey="수익" fill="hsl(var(--foreground))" radius={[0, 6, 6, 0]} barSize={barHeight} />
      </BarChart>
    </ResponsiveContainer>
    </div>
  );
};
