import { useState } from 'react';
import type { SmartCard } from '@tutomate/core';

type Props = Extract<SmartCard, { type: 'importResult' }>;

const won = (n: number) => n.toLocaleString('ko-KR') + '원';
function shortDate(iso: string): string {
  const m = iso.match(/^\d{4}-(\d{2})-(\d{2})/);
  return m ? `${Number(m[1])}월 ${Number(m[2])}일` : iso;
}

export function ImportResultCard({ added, duplicated, errors, unmatched, savedItems }: Props) {
  const list = savedItems ?? [];
  const LIMIT = 20;
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? list : list.slice(0, LIMIT);

  return (
    <div className="border-2 border-emerald-500/40 bg-emerald-500/10 rounded-2xl p-4 text-foreground">
      <div className="font-bold text-lg mb-1">완료</div>
      <div className="text-base text-muted-foreground">
        추가: <span className="text-foreground font-semibold">{added}</span>건 ·
        중복 제외: <span className="text-foreground font-semibold">{duplicated}</span>건
        {typeof unmatched === 'number' && unmatched > 0 && (
          <>
            {' '}· 미매칭: <span className="text-foreground font-semibold">{unmatched}</span>건
          </>
        )}{' '}
        · 오류: <span className="text-foreground font-semibold">{errors}</span>건
      </div>

      {/* 저장 요약 — 무엇을 저장했는지 한눈에 */}
      {list.length > 0 && (
        <div className="mt-3 bg-card border border-border rounded-xl p-3">
          <div className="text-sm text-muted-foreground mb-2">저장한 내역</div>
          <ul className="space-y-1.5">
            {shown.map((it, i) => (
              <li key={i} className="flex items-start justify-between gap-2 text-base">
                <div className="min-w-0">
                  <div className="truncate">
                    <b>{it.studentName || '(이름 미상)'}</b>
                    {it.courseName ? ` · ${it.courseName}` : ''}
                  </div>
                  <div className="text-sm text-muted-foreground">{shortDate(it.paidAt)}</div>
                </div>
                <div className="shrink-0 font-medium text-foreground">{won(it.amount)}</div>
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
    </div>
  );
}
