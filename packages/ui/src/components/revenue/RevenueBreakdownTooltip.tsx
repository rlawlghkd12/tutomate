import React from 'react';
import type { Enrollment } from '@tutomate/core';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '../ui/tooltip';

interface Props {
  children: React.ReactNode;          // 트리거 (수익 금액 표시)
  enrollments: Enrollment[];          // 해당 영역의 enrollment (exempt 제외된 상태여야)
  side?: 'top' | 'bottom' | 'left' | 'right';
}

/**
 * 수익 금액에 호버하면 결제수단별(현금/계좌이체/카드/미지정) 분해를 툴팁으로 보여준다.
 * enrollments는 이미 exempt 제외된 수익 대상만 전달해야 한다.
 * 디자인 토큰 기반이라 라이트/다크 모드 자동 대응.
 */
export const RevenueBreakdownTooltip: React.FC<Props> = ({ children, enrollments, side = 'top' }) => {
  const cash = enrollments
    .filter((e) => e.paymentMethod === 'cash')
    .reduce((sum, e) => sum + e.paidAmount, 0);
  const transfer = enrollments
    .filter((e) => e.paymentMethod === 'transfer')
    .reduce((sum, e) => sum + e.paidAmount, 0);
  const card = enrollments
    .filter((e) => e.paymentMethod === 'card')
    .reduce((sum, e) => sum + e.paidAmount, 0);
  const unknown = enrollments
    .filter((e) => !e.paymentMethod)
    .reduce((sum, e) => sum + e.paidAmount, 0);

  const rows: Array<{ label: string; value: number }> = [
    { label: '현금', value: cash },
    { label: '계좌이체', value: transfer },
    { label: '카드', value: card },
  ];
  if (unknown !== 0) {
    rows.push({ label: '미지정', value: unknown });
  }
  const total = cash + transfer + card + unknown;

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-help">{children}</span>
        </TooltipTrigger>
        <TooltipContent
          side={side}
          className="bg-popover text-popover-foreground border border-border px-3 py-2.5 shadow-md"
        >
          <div className="space-y-1 min-w-[150px]">
            {rows.map((row) => (
              <div key={row.label} className="flex justify-between items-baseline gap-4 text-xs">
                <span className="text-muted-foreground">{row.label}</span>
                <span className="font-mono tabular-nums text-foreground">
                  ₩{row.value.toLocaleString()}
                </span>
              </div>
            ))}
            <div className="border-t border-border pt-1 mt-1 flex justify-between items-baseline text-xs">
              <span className="text-muted-foreground">합계</span>
              <span className="font-mono font-semibold tabular-nums text-foreground">
                ₩{total.toLocaleString()}
              </span>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
