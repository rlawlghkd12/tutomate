import { useState } from 'react';
import type { SmartCard, SavedItem } from '@tutomate/core';

type Props = Extract<SmartCard, { type: 'bankDepositResult' }> & {
  onUndo?: (items: SavedItem[]) => void;
};

const won = (n: number) => n.toLocaleString('ko-KR') + '원';
function shortDate(iso: string): string {
  const m = iso.match(/^\d{4}-(\d{2})-(\d{2})/);
  return m ? `${Number(m[1])}월 ${Number(m[2])}일` : iso;
}

export function BankDepositResultCard({ saved, skipped, failed, enrolled, refunded, items, savedItems, onUndo }: Props) {
  // 되돌리기는 id가 있는 savedItems가 있을 때만. 표시는 savedItems 우선, 없으면 items(레거시).
  const undoable = savedItems ?? [];
  const displayFromSaved = undoable.map((s) => ({
    recordId: s.recordId,
    name: s.studentName || '(이름 미상)',
    course: s.courseName,
    amount: Math.abs(s.amount),
    paidAt: s.paidAt,
    kind: s.kind,
    item: s,
  }));
  const displayFromItems = (items ?? []).map((it, i) => ({
    recordId: `it-${i}`,
    name: it.name,
    course: it.course,
    amount: it.amount,
    paidAt: it.paidAt,
    kind: it.kind,
    item: null as SavedItem | null,
  }));
  const list = displayFromSaved.length > 0 ? displayFromSaved : displayFromItems;

  const LIMIT = 20;
  const [expanded, setExpanded] = useState(false);
  const [requested, setRequested] = useState<Set<string>>(new Set());
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const shown = expanded ? list : list.slice(0, LIMIT);
  // 되돌리기 가능(환불 아님 + 아직 요청 안 함) 대상
  const active = undoable.filter((s) => s.kind !== 'refunded' && !requested.has(s.recordId));
  const markRequested = (ids: string[]) => setRequested((prev) => new Set([...prev, ...ids]));

  return (
    <div className="border-2 border-success-subtle bg-success-subtle rounded-2xl p-4 text-foreground">
      <div className="text-lg font-bold text-success">입금 {saved}건 저장 완료</div>
      {!!enrolled && enrolled > 0 && (
        <div className="text-base text-foreground mt-1">{enrolled}명을 강의에 새로 등록했어요.</div>
      )}
      {!!refunded && refunded > 0 && (
        <div className="text-base text-foreground mt-1">환불 {refunded}건을 저장했어요.</div>
      )}

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
                    onClick={() => { onUndo(active); markRequested(active.map((s) => s.recordId)); setConfirmAll(false); }}
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
            {shown.map((row, i) => {
              const done = requested.has(row.recordId);
              const canUndo = !!onUndo && !!row.item && row.kind !== 'refunded';
              return (
                <li key={row.recordId || i} className="flex items-start justify-between gap-2 text-base">
                  <div className="min-w-0">
                    <div className={`truncate ${done ? 'line-through text-muted-foreground' : ''}`}>
                      <b>{row.name}</b>
                      {row.course ? ` · ${row.course}` : ''}
                      {row.kind === 'enrolled' && (
                        <span className="ml-1.5 text-sm text-primary font-medium">신규 등록</span>
                      )}
                      {row.kind === 'refunded' && (
                        <span className="ml-1.5 text-sm text-destructive font-medium">환불</span>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">{shortDate(row.paidAt)}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`font-medium ${row.kind === 'refunded' ? 'text-destructive' : 'text-foreground'}`}>
                      {row.kind === 'refunded' ? '-' : ''}{won(row.amount)}
                    </span>
                    {canUndo && (done ? (
                      <span className="text-sm text-muted-foreground">처리됨</span>
                    ) : confirmId === row.recordId ? (
                      <span className="text-sm flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => { onUndo!([row.item!]); markRequested([row.recordId]); setConfirmId(null); }}
                          className="font-semibold text-destructive"
                        >예</button>
                        <button type="button" onClick={() => setConfirmId(null)} className="text-muted-foreground">아니오</button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmId(row.recordId)}
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

      {(skipped > 0 || failed > 0) && (
        <div className="text-base text-muted-foreground mt-2">
          {skipped > 0 && `이미 저장된 ${skipped}건은 건너뛰었어요.`}
          {failed > 0 && ` ${failed}건은 저장에 실패했어요.`}
        </div>
      )}
    </div>
  );
}
