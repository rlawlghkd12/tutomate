import React from 'react';

interface Props {
  rows?: number;
  columns?: number;
  showHeader?: boolean;
}

/**
 * 테이블 로딩 스켈레톤 (대시보드 skeleton과 같은 애니메이션).
 * 실제 테이블이 로드되기 전 "데이터 오는 중" 시각 피드백.
 */
export const TableSkeleton: React.FC<Props> = ({ rows = 5, columns = 5, showHeader = true }) => {
  return (
    <div className="rounded-xl overflow-hidden bg-card [box-shadow:var(--shadow-sm)]">
      <div role="status" aria-label="데이터 로딩 중" className="w-full">
        {showHeader && (
          <div className="flex border-b bg-muted/30 px-3 py-2.5 gap-3">
            {Array.from({ length: columns }).map((_, i) => (
              <div
                key={`h-${i}`}
                className="h-4 flex-1 rounded"
                style={{ background: 'hsl(var(--muted))', animation: 'skeleton-pulse 1.5s ease-in-out infinite' }}
              />
            ))}
          </div>
        )}
        {Array.from({ length: rows }).map((_, r) => (
          <div key={`r-${r}`} className="flex border-b px-3 py-3.5 gap-3">
            {Array.from({ length: columns }).map((_, c) => (
              <div
                key={`c-${r}-${c}`}
                className="h-5 flex-1 rounded"
                style={{
                  background: 'hsl(var(--muted))',
                  animation: 'skeleton-pulse 1.5s ease-in-out infinite',
                  animationDelay: `${(r * columns + c) * 50}ms`,
                  opacity: 0.6 + ((c + r) % 3) * 0.15,
                }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};
