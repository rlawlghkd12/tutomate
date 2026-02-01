import React, { useMemo } from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import type { Enrollment } from '../../types';

interface PaymentStatusChartProps {
  enrollments: Enrollment[];
}

const COLORS = {
  completed: '#52c41a',
  partial: '#faad14',
  pending: '#f5222d',
};

const STATUS_LABELS = {
  completed: '완납',
  partial: '부분납부',
  pending: '미납',
};

export const PaymentStatusChart: React.FC<PaymentStatusChartProps> = ({ enrollments }) => {
  const statusData = useMemo(() => {
    const completed = enrollments.filter((e) => e.paymentStatus === 'completed').length;
    const partial = enrollments.filter((e) => e.paymentStatus === 'partial').length;
    const pending = enrollments.filter((e) => e.paymentStatus === 'pending').length;

    return [
      { name: STATUS_LABELS.completed, value: completed, status: 'completed' },
      { name: STATUS_LABELS.partial, value: partial, status: 'partial' },
      { name: STATUS_LABELS.pending, value: pending, status: 'pending' },
    ].filter((item) => item.value > 0); // 값이 0인 항목은 제외
  }, [enrollments]);

  const renderCustomLabel = ({ name, value, percent }: any) => {
    return `${name}: ${value}건 (${(percent * 100).toFixed(1)}%)`;
  };

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
        >
          {statusData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={COLORS[entry.status as keyof typeof COLORS]} />
          ))}
        </Pie>
        <Tooltip />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
};
