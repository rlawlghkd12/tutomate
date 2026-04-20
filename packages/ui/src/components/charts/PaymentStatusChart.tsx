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

// 색맹 접근성: 색 + 패턴(스트라이프/도트/체크/실선)으로 상태 구분
const PATTERN_IDS: Record<string, string> = {
  completed: 'pat-completed',   // 실선 (색만)
  partial: 'pat-partial',       // 대각선 줄무늬
  pending: 'pat-pending',       // 점
  exempt: 'pat-exempt',         // 체크보드
};

const renderActiveShape = (props: any) => {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, payload, value, percent } = props;

  return (
    <g>
      <text x={cx} y={cy - 8} textAnchor="middle" style={{ fill: 'hsl(var(--foreground))', fontSize: '0.93rem', fontWeight: 600 }}>
        {payload.name}
      </text>
      <text x={cx} y={cy + 12} textAnchor="middle" style={{ fill: 'hsl(var(--muted-foreground))', fontSize: '0.79rem' }}>
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

// 색맹 사용자용 SVG 패턴 정의 — 색 + 패턴 이중 구분
const ColorBlindPatterns: React.FC = () => (
  <defs>
    {/* 완납 — 실선 (색만) */}
    <pattern id="pat-completed" patternUnits="userSpaceOnUse" width="1" height="1">
      <rect width="1" height="1" fill={COLORS.completed} />
    </pattern>
    {/* 부분납부 — 대각선 줄무늬 */}
    <pattern id="pat-partial" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
      <rect width="6" height="6" fill={COLORS.partial} />
      <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(0,0,0,0.18)" strokeWidth="2" />
    </pattern>
    {/* 미납 — 점 */}
    <pattern id="pat-pending" patternUnits="userSpaceOnUse" width="6" height="6">
      <rect width="6" height="6" fill={COLORS.pending} />
      <circle cx="3" cy="3" r="1.2" fill="rgba(0,0,0,0.22)" />
    </pattern>
    {/* 면제 — 체크보드 */}
    <pattern id="pat-exempt" patternUnits="userSpaceOnUse" width="6" height="6">
      <rect width="6" height="6" fill={COLORS.exempt} />
      <rect width="3" height="3" fill="rgba(0,0,0,0.15)" />
      <rect x="3" y="3" width="3" height="3" fill="rgba(0,0,0,0.15)" />
    </pattern>
  </defs>
);

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
        <ColorBlindPatterns />
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
            <Cell key={`cell-${entry.status}`} fill={`url(#${PATTERN_IDS[entry.status]})`} />
          ))}
        </Pie>
        {activeIndex === undefined && (
          <text x="50%" y="42%" textAnchor="middle" dominantBaseline="central" style={{ fill: 'hsl(var(--foreground))', fontSize: '1.29rem', fontWeight: 700 }}>
            {totalCount}
          </text>
        )}
        {activeIndex === undefined && (
          <text x="50%" y="52%" textAnchor="middle" dominantBaseline="central" style={{ fill: 'hsl(var(--muted-foreground))', fontSize: '0.79rem' }}>
            총 수강생
          </text>
        )}
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const data = payload[0];
            return (
              <div style={{ background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: 8, padding: '10px 14px', fontSize: '0.86rem' }}>
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
          wrapperStyle={{ fontSize: '0.86rem', color: 'hsl(var(--muted-foreground))', paddingTop: 8 }}
          formatter={(value: string) => (
            <span style={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.86rem' }}>{value}</span>
          )}
        />
      </PieChart>
    </ResponsiveContainer>
  );
};
