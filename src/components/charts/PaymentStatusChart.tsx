import React, { useMemo } from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Empty } from 'antd';
import type { Enrollment } from '../../types';
import { useChartColors, useChartTooltipStyle, FLEX_CENTER } from '../../config/styles';

interface PaymentStatusChartProps {
  enrollments: Enrollment[];
}

const STATUS_LABELS = {
  completed: '완납',
  partial: '부분납부',
  pending: '미납',
  exempt: '면제',
};

export const PaymentStatusChart: React.FC<PaymentStatusChartProps> = ({ enrollments }) => {
  const chartColors = useChartColors();
  const tooltip = useChartTooltipStyle();
  const COLORS = { completed: chartColors.success, partial: chartColors.warning, pending: chartColors.error, exempt: chartColors.exempt };

  const statusData = useMemo(() => {
    const completed = enrollments.filter((e) => e.paymentStatus === 'completed').length;
    const partial = enrollments.filter((e) => e.paymentStatus === 'partial').length;
    const pending = enrollments.filter((e) => e.paymentStatus === 'pending').length;
    const exempt = enrollments.filter((e) => e.paymentStatus === 'exempt').length;

    return [
      { name: STATUS_LABELS.completed, value: completed, status: 'completed' },
      { name: STATUS_LABELS.partial, value: partial, status: 'partial' },
      { name: STATUS_LABELS.pending, value: pending, status: 'pending' },
      { name: STATUS_LABELS.exempt, value: exempt, status: 'exempt' },
    ].filter((item) => item.value > 0);
  }, [enrollments]);

  const renderCustomLabel = ({ name, value, percent }: any) => {
    return `${name}: ${value}건 (${(percent * 100).toFixed(1)}%)`;
  };

  if (enrollments.length === 0) {
    return (
      <div style={{ ...FLEX_CENTER, height: 300 }}>
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="납부 데이터가 없습니다" />
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={statusData}
          cx="50%"
          cy="50%"
          labelLine={false}
          label={renderCustomLabel}
          outerRadius={100}
          fill="#8884d8"
          dataKey="value"
          stroke={chartColors.bgContainer}
        >
          {statusData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={COLORS[entry.status as keyof typeof COLORS]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={tooltip.contentStyle}
          labelStyle={tooltip.labelStyle}
        />
        <Legend wrapperStyle={{ color: chartColors.text }} />
      </PieChart>
    </ResponsiveContainer>
  );
};
