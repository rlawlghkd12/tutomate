import React, { useMemo, useState, useCallback } from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer, Sector } from 'recharts';
import { Empty } from '../ui/empty';
import type { Enrollment } from '@tutomate/core';
import { FLEX_CENTER, isActiveEnrollment } from '@tutomate/core';

interface PaymentStatusChartProps {
  enrollments: Enrollment[];
}

const STATUS_LABELS = {
  completed: '완납',
  partial: '부분납부',
  pending: '미납',
  exempt: '면제',
};

const COLORS: Record<string, string> = {
  completed: '#34d399',
  partial: '#fbbf24',
  pending: '#f87171',
  exempt: '#a78bfa',
};

const renderActiveShape = (props: any) => {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, payload, value, percent } = props;

  return (
    <g>
      <text x={cx} y={cy - 8} textAnchor="middle" style={{ fill: 'hsl(var(--foreground))', fontSize: 14, fontWeight: 600 }}>
        {payload.name}
      </text>
      <text x={cx} y={cy + 12} textAnchor="middle" style={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}>
        {value}건 ({(percent * 100).toFixed(0)}%)
      </text>
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius + 6}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
      />
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius - 2}
        outerRadius={innerRadius}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
      />
    </g>
  );
};

export const PaymentStatusChart: React.FC<PaymentStatusChartProps> = ({ enrollments }) => {
  const [activeIndex, setActiveIndex] = useState<number | undefined>(undefined);

  const onPieEnter = useCallback((_: any, index: number) => {
    setActiveIndex(index);
  }, []);

  const onPieLeave = useCallback(() => {
    setActiveIndex(undefined);
  }, []);

  const statusData = useMemo(() => {
    const completed = enrollments.filter((e) => isActiveEnrollment(e) && e.paymentStatus === 'completed').length;
    const partial = enrollments.filter((e) => isActiveEnrollment(e) && e.paymentStatus === 'partial').length;
    const pending = enrollments.filter((e) => isActiveEnrollment(e) && e.paymentStatus === 'pending').length;
    const exempt = enrollments.filter((e) => isActiveEnrollment(e) && e.paymentStatus === 'exempt').length;

    return [
      { name: STATUS_LABELS.completed, value: completed, status: 'completed' },
      { name: STATUS_LABELS.partial, value: partial, status: 'partial' },
      { name: STATUS_LABELS.pending, value: pending, status: 'pending' },
      { name: STATUS_LABELS.exempt, value: exempt, status: 'exempt' },
    ].filter((item) => item.value > 0);
  }, [enrollments]);

  const totalCount = useMemo(() => statusData.reduce((sum, d) => sum + d.value, 0), [statusData]);

  if (enrollments.length === 0) {
    return (
      <div style={{ ...FLEX_CENTER, height: 300 }}>
        <Empty description="납부 데이터가 없습니다" />
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={statusData}
          cx="50%"
          cy="45%"
          innerRadius={55}
          outerRadius={80}
          dataKey="value"
          paddingAngle={2}
          activeIndex={activeIndex}
          activeShape={renderActiveShape}
          onMouseEnter={onPieEnter}
          onMouseLeave={onPieLeave}
          stroke="none"
        >
          {statusData.map((entry) => (
            <Cell key={`cell-${entry.status}`} fill={COLORS[entry.status]} />
          ))}
        </Pie>
        {activeIndex === undefined && (
          <text x="50%" y="42%" textAnchor="middle" dominantBaseline="central" style={{ fill: 'hsl(var(--foreground))', fontSize: 20, fontWeight: 700 }}>
            {totalCount}
          </text>
        )}
        {activeIndex === undefined && (
          <text x="50%" y="52%" textAnchor="middle" dominantBaseline="central" style={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}>
            총 수강생
          </text>
        )}
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const data = payload[0];
            return (
              <div style={{ background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: 8, padding: '10px 14px', fontSize: 13 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: data.payload.fill }} />
                  <span style={{ fontWeight: 600 }}>{data.name}</span>
                </div>
                <div style={{ marginTop: 4, color: 'hsl(var(--muted-foreground))' }}>
                  {data.value}건 ({((Number(data.value) / totalCount) * 100).toFixed(1)}%)
                </div>
              </div>
            );
          }}
        />
        <Legend
          verticalAlign="bottom"
          wrapperStyle={{ fontSize: 13, color: 'hsl(var(--muted-foreground))', paddingTop: 8 }}
          formatter={(value: string) => (
            <span style={{ color: 'hsl(var(--muted-foreground))', fontSize: 13 }}>{value}</span>
          )}
        />
      </PieChart>
    </ResponsiveContainer>
  );
};
