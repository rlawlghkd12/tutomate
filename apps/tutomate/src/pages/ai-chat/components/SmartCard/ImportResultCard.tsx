import { useState } from 'react';
import type { SmartCard, SavedItem } from '@tutomate/core';

type Props = Extract<SmartCard, { type: 'importResult' }> & {
  onUndo?: (items: SavedItem[]) => void;
};

const won = (n: number) => n.toLocaleString('ko-KR') + '원';
function shortDate(iso: string): string {
  const m = iso.match(/^\d{4}-(\d{2})-(\d{2})/);
  return m ? `${Number(m[1])}월 ${Number(m[2])}일` : iso;
}

export function ImportResultCard({ added, duplicated, errors, unmatched, savedItems, onUndo }: Props) {
  const list = savedItems ?? [];
  const LIMIT = 20;
  const [expanded, setExpanded] = useState(false);
  const [requested, setRequested] = useState<Set<string>>(new Set());
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const shown = expanded ? list : list.slice(0, LIMIT);
  const active = list.filter((it) => !requested.has(it.recordId));

  const markRequested = (ids: string[]) =>
    setRequested((prev) => new Set([...prev, ...ids]));

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

      {list.length > 0 && (
        <div className="mt-3 bg-card border border-border rounded-xl p-3">
          <div className="flex items-center justify-between mb-2 gap-2">
            <div className="text-sm text-muted-foreground">저장한 내역</div>
            {onUndo && active.length > 1 && (
              confirmAll ? (
                <span className="text-sm flex items-center gap-1.5">
                  전체 되돌릴까요?
                  <button
                    type="button"
                    onClick={() => { onUndo(active); markRequested(active.map((it) => it.recordId)); setConfirmAll(false); }}
                    className="font-semibold text-destructive"
                  >예</button>
                  <button type="button" onClick={() => setConfirmAll(false)} className="text-muted-foreground">아니오</button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmAll(true)}
                  className="text-sm text-muted-foreground hover:text-destructive underline underline-offset-2"
                >전체 되돌리기</button>
              )
            )}
          </div>
          <ul className="space-y-1.5">
            {shown.map((it, i) => {
              const done = requested.has(it.recordId);
              return (
                <li key={it.recordId || i} className="flex items-start justify-between gap-2 text-base">
                  <div className="min-w-0">
                    <div className={`truncate ${done ? 'line-through text-muted-foreground' : ''}`}>
                      <b>{it.studentName || '(이름 미상)'}</b>
                      {it.courseName ? ` · ${it.courseName}` : ''}
                    </div>
                    <div className="text-sm text-muted-foreground">{shortDate(it.paidAt)}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-medium text-foreground">{won(it.amount)}</span>
                    {onUndo && (done ? (
                      <span className="text-sm text-muted-foreground">처리됨</span>
                    ) : confirmId === it.recordId ? (
                      <span className="text-sm flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => { onUndo([it]); markRequested([it.recordId]); setConfirmId(null); }}
                          className="font-semibold text-destructive"
                        >예</button>
                        <button type="button" onClick={() => setConfirmId(null)} className="text-muted-foreground">아니오</button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmId(it.recordId)}
                        className="text-sm text-muted-foreground hover:text-destructive"
                      >되돌리기</button>
                    ))}
                  </div>
                </li>
              );
            })}
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
