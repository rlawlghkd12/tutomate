import { useState } from 'react';
import type { ImportBatch, ImportHistoryItem, SavedItem } from '@tutomate/core';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Button } from '../ui/button';

interface Props {
  open: boolean;
  onClose: () => void;
  batches: ImportBatch[];
  loading: boolean;
  /** 되돌릴 항목들(신규등록 정보 포함). 완료 후 목록 갱신은 onRefresh로. */
  onUndo: (items: SavedItem[]) => Promise<void> | void;
  onRefresh: () => void;
}

const won = (n: number) => Math.abs(n).toLocaleString('ko-KR') + '원';
function fmt(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  return m ? `${Number(m[2])}/${Number(m[3])} ${m[4]}:${m[5]}` : iso;
}
function shortDate(iso: string): string {
  const m = iso.match(/^\d{4}-(\d{2})-(\d{2})/);
  return m ? `${Number(m[1])}월 ${Number(m[2])}일` : iso;
}
const sourceLabel = (s: string) => (s === 'bank' ? '은행 입금' : s === 'excel' ? '엑셀' : s || '임포트');

export function ImportHistoryDialog({ open, onClose, batches, loading, onUndo, onRefresh }: Props) {
  const [confirmId, setConfirmId] = useState<string | null>(null); // recordId 또는 `batch:<id>`
  const [busy, setBusy] = useState(false);

  const run = async (items: SavedItem[]) => {
    setBusy(true);
    try {
      await onUndo(items);
      onRefresh();
    } finally {
      setBusy(false);
      setConfirmId(null);
    }
  };

  const undoableOf = (b: ImportBatch): ImportHistoryItem[] =>
    b.items.filter((it) => !it.undone && it.kind !== 'refunded');

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[560px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>AI 처리 내역</DialogTitle>
          <DialogDescription className="sr-only">AI로 저장한 임포트 내역과 되돌리기</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-10 text-center text-muted-foreground">불러오는 중…</div>
        ) : batches.length === 0 ? (
          <div className="py-10 text-center text-muted-foreground">아직 AI로 저장한 내역이 없어요.</div>
        ) : (
          <div className="space-y-3">
            {batches.map((b) => {
              const undoable = undoableOf(b);
              return (
                <div key={b.batchId} className="rounded-xl border border-border p-3">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="text-sm">
                      <span className="font-semibold">{sourceLabel(b.source)}</span>
                      <span className="text-muted-foreground"> · {fmt(b.createdAt)} · {b.items.length}건</span>
                    </div>
                    {undoable.length > 1 && (
                      confirmId === `batch:${b.batchId}` ? (
                        <span className="text-sm flex items-center gap-1.5">
                          전체 되돌릴까요?
                          <button type="button" disabled={busy} onClick={() => run(undoable)} className="font-semibold text-destructive disabled:opacity-50">예</button>
                          <button type="button" onClick={() => setConfirmId(null)} className="text-muted-foreground">아니오</button>
                        </span>
                      ) : (
                        <button type="button" onClick={() => setConfirmId(`batch:${b.batchId}`)} className="text-sm text-muted-foreground hover:text-destructive underline underline-offset-2">전체 되돌리기</button>
                      )
                    )}
                  </div>
                  <ul className="space-y-1.5">
                    {b.items.map((it, i) => (
                      <li key={it.recordId || i} className="flex items-start justify-between gap-2 text-base">
                        <div className="min-w-0">
                          <div className={`truncate ${it.undone ? 'line-through text-muted-foreground' : ''}`}>
                            <b>{it.studentName || '(이름 미상)'}</b>{it.courseName ? ` · ${it.courseName}` : ''}
                            {it.kind === 'enrolled' && <span className="ml-1.5 text-sm text-primary font-medium">신규 등록</span>}
                            {it.kind === 'refunded' && <span className="ml-1.5 text-sm text-destructive font-medium">환불</span>}
                          </div>
                          <div className="text-sm text-muted-foreground">{shortDate(it.paidAt)}</div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`font-medium ${it.kind === 'refunded' ? 'text-destructive' : 'text-foreground'}`}>
                            {it.kind === 'refunded' ? '-' : ''}{won(it.amount)}
                          </span>
                          {it.undone ? (
                            <span className="text-sm text-muted-foreground">취소됨</span>
                          ) : it.kind === 'refunded' ? null : confirmId === it.recordId ? (
                            <span className="text-sm flex items-center gap-1.5">
                              <button type="button" disabled={busy} onClick={() => run([it])} className="font-semibold text-destructive disabled:opacity-50">예</button>
                              <button type="button" onClick={() => setConfirmId(null)} className="text-muted-foreground">아니오</button>
                            </span>
                          ) : (
                            <button type="button" onClick={() => setConfirmId(it.recordId)} className="text-sm text-muted-foreground hover:text-destructive">되돌리기</button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-3 flex justify-end">
          <Button variant="outline" onClick={onClose}>닫기</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
