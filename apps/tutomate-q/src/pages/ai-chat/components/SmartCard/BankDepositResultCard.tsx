import { useState } from 'react';
import type { SmartCard } from '@tutomate/core';

type Props = Extract<SmartCard, { type: 'bankDepositResult' }>;

const won = (n: number) => n.toLocaleString('ko-KR') + '원';
function shortDate(iso: string): string {
  const m = iso.match(/^\d{4}-(\d{2})-(\d{2})/);
  return m ? `${Number(m[1])}월 ${Number(m[2])}일` : iso;
}

export function BankDepositResultCard({ saved, skipped, failed, enrolled, refunded, items }: Props) {
  const list = items ?? [];
  const LIMIT = 20;
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? list : list.slice(0, LIMIT);

  return (
    <div className="border-2 border-success-subtle bg-success-subtle rounded-2xl p-4 text-foreground">
      <div className="text-lg font-bold text-success">입금 {saved}건 저장 완료</div>
      {!!enrolled && enrolled > 0 && (
        <div className="text-base text-foreground mt-1">{enrolled}명을 강의에 새로 등록했어요.</div>
      )}
      {!!refunded && refunded > 0 && (
        <div className="text-base text-foreground mt-1">환불 {refunded}건을 저장했어요.</div>
      )}

      {/* 저장 요약 — 무엇을 저장했는지 한눈에 */}
      {list.length > 0 && (
        <div className="mt-3 bg-card border border-border rounded-xl p-3">
          <div className="text-sm text-muted-foreground mb-2">저장한 내역</div>
          <ul className="space-y-1.5">
            {shown.map((it, i) => (
              <li key={i} className="flex items-start justify-between gap-2 text-base">
                <div className="min-w-0">
                  <div className="truncate">
                    <b>{it.name}</b>
                    {it.course ? ` · ${it.course}` : ''}
                    {it.kind === 'enrolled' && (
                      <span className="ml-1.5 text-sm text-primary font-medium">신규 등록</span>
                    )}
                    {it.kind === 'refunded' && (
                      <span className="ml-1.5 text-sm text-destructive font-medium">환불</span>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground">{shortDate(it.paidAt)}</div>
                </div>
                <div
                  className={`shrink-0 font-medium ${it.kind === 'refunded' ? 'text-destructive' : 'text-foreground'}`}
                >
                  {it.kind === 'refunded' ? '-' : ''}
                  {won(it.amount)}
                </div>
              </li>
            ))}
          </ul>
          {list.length > LIMIT && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-2 w-full rounded-lg border border-border py-2 text-base font-medium text-foreground hover:bg-accent"
            >
              {expanded ? '접기' : `더보기 (외 ${list.length - LIMIT}건)`}
            </button>
          )}
        </div>
      )}

      {(skipped > 0 || failed > 0) && (
        <div className="text-base text-muted-foreground mt-2">
          {skipped > 0 && `이미 저장된 ${skipped}건은 건너뛰었어요.`}
          {failed > 0 && ` ${failed}건은 저장에 실패했어요.`}
        </div>
      )}
    </div>
  );
}
