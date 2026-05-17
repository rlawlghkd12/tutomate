import React from 'react';
import type { Enrollment, PaymentRecord } from '@tutomate/core';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '../ui/tooltip';

interface Props {
  children: React.ReactNode;
  enrollments: Enrollment[];          // exempt 제외된 enrollment
  records?: PaymentRecord[];          // 제공되면 records 기반 정확 계산
  side?: 'top' | 'bottom' | 'left' | 'right';
}

/**
 * 수익 금액 호버 툴팁.
 * - records 전달 시: 실제 납부 기록 기반으로 gross/환불/net + 결제수단별
 * - enrollment 구조 기반 "활성/미환불" 분리 표시 (환불 없이 포기한 잔여 수익 명확화)
 */
export const RevenueBreakdownTooltip: React.FC<Props> = ({ children, enrollments, records, side = 'top' }) => {
  const useRecords = Array.isArray(records);

  // 활성(active) vs 미환불(withdrawn이지만 paidAmount>0) 분리
  const activePaid = enrollments
    .filter((e) => e.paymentStatus !== 'withdrawn')
    .reduce((s, e) => s + e.paidAmount, 0);
  const withdrawnKept = enrollments
    .filter((e) => e.paymentStatus === 'withdrawn')
    .reduce((s, e) => s + e.paidAmount, 0);

  let cash: number, transfer: number, card: number, unknown: number;
  let gross = 0;
  let refund = 0;

  if (useRecords && records) {
    const enrollmentIds = new Set(enrollments.map((e) => e.id));
    const relevant = records.filter((r) => enrollmentIds.has(r.enrollmentId));
    cash = relevant.filter((r) => r.paymentMethod === 'cash').reduce((s, r) => s + r.amount, 0);
    transfer = relevant.filter((r) => r.paymentMethod === 'transfer').reduce((s, r) => s + r.amount, 0);
    card = relevant.filter((r) => r.paymentMethod === 'card').reduce((s, r) => s + r.amount, 0);
    unknown = relevant.filter((r) => !r.paymentMethod).reduce((s, r) => s + r.amount, 0);
    gross = relevant.filter((r) => r.amount > 0).reduce((s, r) => s + r.amount, 0);
    refund = Math.abs(relevant.filter((r) => r.amount < 0).reduce((s, r) => s + r.amount, 0));
  } else {
    cash = enrollments.filter((e) => e.paymentMethod === 'cash').reduce((s, e) => s + e.paidAmount, 0);
    transfer = enrollments.filter((e) => e.paymentMethod === 'transfer').reduce((s, e) => s + e.paidAmount, 0);
    card = enrollments.filter((e) => e.paymentMethod === 'card').reduce((s, e) => s + e.paidAmount, 0);
    unknown = enrollments.filter((e) => !e.paymentMethod).reduce((s, e) => s + e.paidAmount, 0);
  }

  const methodRows: Array<{ label: string; value: number }> = [
    { label: '현금', value: cash },
    { label: '계좌이체', value: transfer },
    { label: '카드', value: card },
  ];
  if (unknown !== 0) {
    methodRows.push({ label: '미지정', value: unknown });
  }
  const net = cash + transfer + card + unknown;
  const showSourceBreakdown = withdrawnKept > 0; // 미환불분 있을 때만 분해 표시

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
          <div className="space-y-1 min-w-[200px]">
            {/* 수익 구성: 활성 vs 미환불 */}
            {showSourceBreakdown && (
              <>
                <div className="flex justify-between items-baseline gap-4 text-xs">
                  <span className="text-muted-foreground">수강 중</span>
                  <span className="font-mono tabular-nums text-foreground">
                    ₩{activePaid.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between items-baseline gap-4 text-xs">
                  <span className="text-muted-foreground" title="환불 없이 포기한 수강생이 낸 금액 — 학원이 수취 유지">
                    미환불
                  </span>
                  <span className="font-mono tabular-nums text-warning">
                    ₩{withdrawnKept.toLocaleString()}
                  </span>
                </div>
                <div className="border-t border-border pt-1 mt-1" />
              </>
            )}
            {/* 환불 있을 때 gross/환불 라인 */}
            {useRecords && refund > 0 && (
              <>
                <div className="flex justify-between items-baseline gap-4 text-xs">
                  <span className="text-muted-foreground">총 납부</span>
                  <span className="font-mono tabular-nums text-foreground">
                    ₩{gross.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between items-baseline gap-4 text-xs">
                  <span className="text-muted-foreground">환불</span>
                  <span className="font-mono tabular-nums text-destructive">
                    −₩{refund.toLocaleString()}
                  </span>
                </div>
                <div className="border-t border-border pt-1 mt-1" />
              </>
            )}
            {/* 결제수단별 */}
            {methodRows.map((row) => (
              <div key={row.label} className="flex justify-between items-baseline gap-4 text-xs">
                <span className="text-muted-foreground">{row.label}</span>
                <span className={`font-mono tabular-nums ${row.value < 0 ? 'text-destructive' : 'text-foreground'}`}>
                  {row.value < 0 ? '−' : ''}₩{Math.abs(row.value).toLocaleString()}
                </span>
              </div>
            ))}
            <div className="border-t border-border pt-1 mt-1 flex justify-between items-baseline text-xs">
              <span className="text-muted-foreground">{(useRecords && refund > 0) || showSourceBreakdown ? '순수익' : '합계'}</span>
              <span className="font-mono font-semibold tabular-nums text-foreground">
                ₩{net.toLocaleString()}
              </span>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
