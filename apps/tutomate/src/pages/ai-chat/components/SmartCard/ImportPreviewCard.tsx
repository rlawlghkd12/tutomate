import { useMemo, useState } from 'react';
import { Check, AlertTriangle } from 'lucide-react';
import type { SmartCard, ImportPreviewRow } from '@tutomate/core';

/** confirmImport에 넘길 저장 대상 결제 행 */
export type PaymentSelection = {
  enrollmentId: string;
  paidAt: string;
  amount: number;
  paymentMethod?: 'cash' | 'card' | 'transfer';
  notes?: string;
};

type Props = Extract<SmartCard, { type: 'importPreview' }> & {
  onConfirm: (selections?: PaymentSelection[]) => void;
  onCancel: () => void;
};

const won = (n: number) => n.toLocaleString('ko-KR');
const isMethod = (m?: string): m is 'cash' | 'card' | 'transfer' =>
  m === 'cash' || m === 'card' || m === 'transfer';

const dedupLabel: Record<string, string> = {
  exact: '중복',
  periodComplete: '완납',
  overpay: '초과',
  none: '',
};

function StatusBadge({ r }: { r: ImportPreviewRow }) {
  if (r.dedup !== 'none') {
    const cls =
      r.dedup === 'exact'
        ? 'bg-destructive/15 text-destructive'
        : 'bg-amber-500/15 text-amber-700 dark:text-amber-400';
    return <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${cls}`}>{dedupLabel[r.dedup]}</span>;
  }
  if (r.matchStatus === 'unmatched')
    return <span className="px-1.5 py-0.5 rounded text-xs font-semibold bg-muted text-muted-foreground">못 찾음</span>;
  if (r.matchStatus === 'needsConfirm')
    return (
      <span className="px-1.5 py-0.5 rounded text-xs font-semibold bg-amber-500/15 text-amber-700 dark:text-amber-400">
        확인해요
      </span>
    );
  return (
    <span className="px-1.5 py-0.5 rounded text-xs font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
      자동
    </span>
  );
}

/** 강화 미리보기 — 행별 체크박스로 저장 대상 선택. 반환: onConfirm(selections). */
function EnrichedRows({
  previewRows,
  onConfirm,
  onCancel,
}: {
  previewRows: ImportPreviewRow[];
  onConfirm: (selections?: PaymentSelection[]) => void;
  onCancel: () => void;
}) {
  const [busy, setBusy] = useState(false);
  // 애매 행(enrollment 미해결)에서 사용자가 후보 중 고른 값
  const [picked, setPicked] = useState<Map<number, string>>(new Map());
  const resolvedEnrollment = (r: ImportPreviewRow) => picked.get(r.rowIndex) ?? r.enrollmentId;
  // 체크 가능한 행 = enrollment이 해결(또는 사용자가 후보 선택)된 행. 미매칭/정확중복은 불가.
  const selectable = (r: ImportPreviewRow) => !!resolvedEnrollment(r) && r.dedup !== 'exact';
  // 후보를 골라야 하는 애매 행(자동 해결 안 됐고 후보가 있음)
  const needsPick = (r: ImportPreviewRow) => !r.enrollmentId && r.candidates.length > 0 && r.dedup !== 'exact';
  const [checked, setChecked] = useState<Set<number>>(
    () => new Set(previewRows.filter((r) => r.decision === 'include' && !!r.enrollmentId).map((r) => r.rowIndex)),
  );

  const pickCandidate = (rowIndex: number, enrollmentId: string) =>
    setPicked((prev) => {
      const next = new Map(prev);
      if (enrollmentId) next.set(rowIndex, enrollmentId);
      else next.delete(rowIndex);
      return next;
    });

  const counts = useMemo(() => {
    const total = previewRows.filter(selectable).length;
    return { total, sel: checked.size };
    // selectable()은 picked에도 의존 → picked 변화 시 total 재계산되도록 의존성에 포함
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewRows, checked, picked]);

  const toggle = (idx: number) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });

  // 일괄 선택/해제 — 체크 가능한 행 전체, 또는 '자동 매칭'만.
  const selectAll = () => setChecked(new Set(previewRows.filter(selectable).map((r) => r.rowIndex)));
  const clearAll = () => setChecked(new Set());
  const selectAutoOnly = () =>
    setChecked(new Set(previewRows.filter((r) => selectable(r) && r.matchStatus === 'auto').map((r) => r.rowIndex)));

  const confirm = () => {
    setBusy(true);
    const selections: PaymentSelection[] = previewRows
      .filter((r) => checked.has(r.rowIndex) && !!resolvedEnrollment(r))
      .map((r) => ({
        enrollmentId: resolvedEnrollment(r)!,
        paidAt: r.paidAt,
        amount: r.amount,
        ...(isMethod(r.paymentMethod) ? { paymentMethod: r.paymentMethod } : {}),
        ...(r.memo ? { notes: r.memo } : {}),
      }));
    onConfirm(selections);
  };

  return (
    <>
      <div className="flex items-center flex-wrap gap-2 mb-2">
        <span className="text-sm">
          저장 선택 <strong className="text-emerald-600 dark:text-emerald-400">{counts.sel}</strong> / {counts.total}건
        </span>
        <div className="flex gap-1 ml-auto">
          <button onClick={selectAll} className="text-xs px-2 py-1 rounded border border-border hover:bg-accent">전체 선택</button>
          <button onClick={selectAutoOnly} className="text-xs px-2 py-1 rounded border border-border hover:bg-accent">자동만</button>
          <button onClick={clearAll} className="text-xs px-2 py-1 rounded border border-border hover:bg-accent">전체 해제</button>
        </div>
      </div>
      <div className="bg-background border border-border rounded-xl p-2 mb-3 max-h-72 overflow-y-auto">
        {previewRows.map((r) => {
          const can = selectable(r);
          const pick = needsPick(r);
          return (
            <div key={r.rowIndex} className="text-sm p-2 border-b border-border last:border-0">
              <div className={`flex items-center gap-2 ${can ? '' : 'opacity-60'}`} title={r.reason}>
                <input
                  type="checkbox"
                  disabled={!can}
                  checked={checked.has(r.rowIndex)}
                  onChange={() => can && toggle(r.rowIndex)}
                  className="shrink-0"
                />
                <StatusBadge r={r} />
                <span className="font-medium">{r.payerName || '(이름 미상)'}</span>
                <span className="text-muted-foreground">{won(r.amount)}원</span>
                <span className="text-muted-foreground text-xs">{r.paidAt}</span>
                {r.courseName && <span className="text-xs text-muted-foreground">· {r.courseName}</span>}
                {r.quarter && (
                  <span className="text-[11px] px-1 py-0.5 rounded bg-sky-500/10 text-sky-700 dark:text-sky-400">
                    {r.quarter}
                  </span>
                )}
                {/* 사유는 문장 대신 짧은 태그(칩)로 — 한눈에 스캔. 전체 문장은 행 title(툴팁)로 제공. */}
                {r.tags?.length > 0 && (
                  <span className="ml-auto flex flex-wrap gap-1 justify-end">
                    {r.tags.map((t) => (
                      <span key={t} className="text-[11px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground whitespace-nowrap">
                        {t}
                      </span>
                    ))}
                  </span>
                )}
              </div>
              {pick && (
                <div className="flex items-center gap-2 mt-1 pl-6">
                  <span className="text-xs text-muted-foreground">어떤 수업 결제인가요?</span>
                  <select
                    value={picked.get(r.rowIndex) ?? ''}
                    onChange={(e) => {
                      const eid = e.target.value;
                      pickCandidate(r.rowIndex, eid);
                      // 후보를 고르면 자동으로 저장 대상에 포함, 해제하면 빼기
                      setChecked((prev) => {
                        const next = new Set(prev);
                        if (eid) next.add(r.rowIndex);
                        else next.delete(r.rowIndex);
                        return next;
                      });
                    }}
                    className="text-xs border border-border rounded px-1 py-0.5 bg-background"
                  >
                    <option value="">아직 안 골랐어요</option>
                    {r.candidates.map((c) => (
                      <option key={c.enrollmentId} value={c.enrollmentId}>
                        {c.studentName} · {c.courseName}
                        {c.quarter ? ` (${c.quarter})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="text-xs text-muted-foreground mb-2 flex items-start gap-1.5">
        <Check className="h-3.5 w-3.5 shrink-0 mt-0.5 text-emerald-600" />
        <span>체크한 것만 저장돼요. 중복·완납·초과·못 찾은 건은 실수를 막으려고 미리 빼뒀어요 — 필요하면 직접 체크하세요.</span>
      </div>
      <div className="flex gap-3">
        <button
          disabled={busy || counts.sel === 0}
          onClick={confirm}
          className="bg-primary text-primary-foreground px-6 py-3 rounded-xl text-lg disabled:opacity-50"
        >
          {busy ? '처리 중…' : `선택 ${counts.sel}건 저장`}
        </button>
        <button
          disabled={busy}
          onClick={onCancel}
          className="bg-secondary text-secondary-foreground border border-border px-6 py-3 rounded-xl text-lg disabled:opacity-50 hover:bg-accent"
        >
          취소
        </button>
      </div>
    </>
  );
}

export function ImportPreviewCard({
  rows,
  total,
  errorRows,
  previewRows,
  onConfirm,
  onCancel,
}: Props) {
  const [busy, setBusy] = useState(false);
  const hasEnriched = !!previewRows && previewRows.length > 0;

  return (
    <div className="border-2 border-primary/40 bg-primary/5 rounded-2xl p-4 text-foreground">
      <div className="font-bold text-lg mb-2">
        결제 미리보기 (총 {total}건{hasEnriched ? '' : ' 중 5건만 보기'})
      </div>
      {errorRows > 0 && (
        <div className="text-destructive mb-2 flex items-center gap-1.5">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {errorRows}건은 날짜·금액 정보가 부족해서 빼뒀어요
        </div>
      )}
      {hasEnriched ? (
        <EnrichedRows previewRows={previewRows!} onConfirm={onConfirm} onCancel={onCancel} />
      ) : (
        <>
          <div className="bg-background border border-border rounded-xl p-2 mb-3 max-h-60 overflow-y-auto">
            {rows.slice(0, 5).map((r, i) => (
              <div
                key={i}
                className={`text-sm p-2 border-b border-border last:border-0 text-foreground ${
                  r.errors?.length ? 'bg-destructive/10' : ''
                }`}
              >
                {Object.entries(r.data).map(([k, v]) => (
                  <span key={k} className="mr-3">
                    <strong>{k}</strong>: <span className="text-muted-foreground">{String(v)}</span>
                  </span>
                ))}
              </div>
            ))}
          </div>
          <div className="flex gap-3">
            <button
              disabled={busy}
              onClick={() => {
                setBusy(true);
                onConfirm();
              }}
              className="bg-primary text-primary-foreground px-6 py-3 rounded-xl text-lg disabled:opacity-50"
            >
              {busy ? '처리 중…' : '확정'}
            </button>
            <button
              disabled={busy}
              onClick={onCancel}
              className="bg-secondary text-secondary-foreground border border-border px-6 py-3 rounded-xl text-lg disabled:opacity-50 hover:bg-accent"
            >
              취소
            </button>
          </div>
        </>
      )}
    </div>
  );
}
