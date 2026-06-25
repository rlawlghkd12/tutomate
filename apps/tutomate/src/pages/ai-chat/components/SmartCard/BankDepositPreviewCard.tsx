import { useEffect, useRef, useState, type ButtonHTMLAttributes } from 'react';
import type { SmartCard, MatchCandidate, DepositSelection } from '@tutomate/core';
import { appConfig, getCurrentQuarter, getQuarterOptions } from '@tutomate/core';

type Card = Extract<SmartCard, { type: 'bankDepositPreview' }>;
type Props = Card & {
  onConfirm: (selections: DepositSelection[]) => void;
  onCancel: () => void;
};

type Decision = {
  enrollmentId?: string;
  newEnrollment?: { studentId: string; courseId: string; quarter?: string };
  split?: { enrollmentId: string; amount: number }[];
};

const won = (n: number) => n.toLocaleString('ko-KR') + '원';
function shortDate(iso: string): string {
  const m = iso.match(/^\d{4}-(\d{2})-(\d{2})/);
  return m ? `${Number(m[1])}월 ${Number(m[2])}일` : iso;
}

type Tone = 'primary' | 'success' | 'outline' | 'ghost' | 'secondary';
const TONE: Record<Tone, string> = {
  primary: 'bg-primary text-primary-foreground hover:opacity-90',
  success: 'bg-success text-white hover:opacity-90',
  outline: 'border-2 border-border bg-card hover:bg-accent text-foreground',
  ghost: 'text-muted-foreground hover:bg-accent',
  secondary: 'bg-secondary text-secondary-foreground border border-border hover:bg-accent',
};
function BigButton({
  tone,
  className = '',
  ...rest
}: { tone: Tone } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={`px-6 py-4 rounded-xl text-lg font-medium text-left disabled:opacity-50 ${TONE[tone]} ${className}`}
    />
  );
}

/**
 * 은행 입금 분석 결과를 어르신 사용자도 한 번에 이해하도록 단계형으로 보여준다.
 * 1) 요약  2) 한 건씩 확인(기존 결제 이력 비교 / 신규 등록 제안)  3) 마무리.
 * 색은 모두 테마 토큰(primary/success/warning/destructive/muted)으로 다크모드 자동 대응.
 */
export function BankDepositPreviewCard({ summary, items, onConfirm, onCancel }: Props) {
  const auto = items.filter((i) => i.status === 'auto');
  // 확인이 필요한 건(직접 선택) + 새로 등록할 건을 한 흐름에서 한 건씩 처리
  const review = items.filter(
    (i) => i.status === 'needsConfirm' || i.status === 'needsEnrollment',
  );
  const unmatched = items.filter((i) => i.status === 'unmatched');
  const newEnrollCount = items.filter((i) => i.status === 'needsEnrollment').length;
  const splitCount = items.filter((i) => i.status === 'needsSplit').length;

  const [step, setStep] = useState<'intro' | 'review' | 'ready'>('intro');
  const [idx, setIdx] = useState(0);
  const [decisions, setDecisions] = useState<Record<number, Decision>>({});
  const [showAlt, setShowAlt] = useState(false);
  const [pickQuarter, setPickQuarter] = useState(false);
  const [busy, setBusy] = useState(false);

  // 화면이 바뀌기 전 같은 버튼이 두 번 처리되는 것(더블클릭)을 막는 잠금.
  // idx/step이 바뀌어 새 화면이 렌더되면 자동 해제된다.
  const navLock = useRef(false);
  useEffect(() => {
    navLock.current = false;
  }, [idx, step, showAlt, pickQuarter]);
  function guard(fn: () => void) {
    if (navLock.current || busy) return;
    navLock.current = true;
    fn();
  }

  const cur = review[idx];
  // 합산 분할은 한 건의 결정이 여러 결제로 저장되므로 '저장될 기록 수'로 센다.
  const recordsOf = (d: Decision) => (d.split ? d.split.length : 1);
  const confirmedRecords = Object.values(decisions).reduce((a, d) => a + recordsOf(d), 0);
  const autoSaveCount = auto.filter((i) => !i.duplicate).length;
  const totalSave = autoSaveCount + confirmedRecords;

  function goNext() {
    setShowAlt(false);
    setPickQuarter(false);
    if (idx + 1 < review.length) setIdx(idx + 1);
    else setStep('ready');
  }
  function accept(enrollmentId: string) {
    setDecisions((d) => ({ ...d, [cur.rowIndex]: { enrollmentId } }));
    goNext();
  }
  function acceptEnroll(c: MatchCandidate, quarter?: string) {
    setDecisions((d) => ({
      ...d,
      [cur.rowIndex]: { newEnrollment: { studentId: c.studentId, courseId: c.courseId, quarter } },
    }));
    goNext();
  }
  function acceptSplit() {
    const split = cur.candidates.map((c) => ({ enrollmentId: c.enrollmentId, amount: c.fee }));
    setDecisions((d) => ({ ...d, [cur.rowIndex]: { split } }));
    goNext();
  }
  function skip() {
    setDecisions((d) => {
      const n = { ...d };
      delete n[cur.rowIndex];
      return n;
    });
    goNext();
  }
  function skipAllRemaining() {
    setDecisions((d) => {
      const n = { ...d };
      for (let i = idx; i < review.length; i++) delete n[review[i].rowIndex];
      return n;
    });
    setShowAlt(false);
    setPickQuarter(false);
    setStep('ready');
  }
  function save() {
    const selections: DepositSelection[] = Object.entries(decisions).map(([rowIndex, d]) => ({
      rowIndex: Number(rowIndex),
      ...d,
    }));
    setBusy(true);
    onConfirm(selections);
  }
  function cancel() {
    setBusy(true);
    onCancel();
  }

  // ── 1) 요약 ──
  if (step === 'intro') {
    return (
      <div className="border-2 border-border bg-card rounded-2xl p-5 text-foreground">
        <div className="text-xl font-bold mb-3">입금 내역을 확인했어요</div>
        <div className="text-lg mb-1 text-muted-foreground">
          {summary.period ? `${summary.period} · ` : ''}은행 입금 {summary.total}건
        </div>
        <ul className="text-lg space-y-1.5 my-4">
          <li>
            <span className="text-success font-bold">●</span> 바로 저장할 수 있는 입금{' '}
            <b>{autoSaveCount}건</b>
          </li>
          {review.length - newEnrollCount - splitCount > 0 && (
            <li>
              <span className="text-warning font-bold">●</span> 같이 확인할 입금{' '}
              <b className="text-warning">{review.length - newEnrollCount - splitCount}건</b>
            </li>
          )}
          {splitCount > 0 && (
            <li>
              <span className="text-warning font-bold">●</span> 여러 강의 합산 입금{' '}
              <b className="text-warning">{splitCount}건</b>
            </li>
          )}
          {newEnrollCount > 0 && (
            <li>
              <span className="text-primary font-bold">●</span> 새로 등록하고 저장할 입금{' '}
              <b className="text-primary">{newEnrollCount}건</b>
            </li>
          )}
          {summary.duplicate > 0 && (
            <li className="text-muted-foreground">
              <span>●</span> 이미 저장돼 있어 건너뛸 입금 {summary.duplicate}건
            </li>
          )}
          {unmatched.length > 0 && (
            <li className="text-muted-foreground">
              <span>●</span> 누구 입금인지 몰라 저장 못 한 것 {unmatched.length}건
            </li>
          )}
        </ul>
        <div className="flex flex-col sm:flex-row gap-2">
          {review.length > 0 ? (
            <BigButton tone="primary" onClick={() => guard(() => setStep('review'))} disabled={busy}>
              {review.length}건 같이 확인하기
            </BigButton>
          ) : (
            <BigButton tone="primary" onClick={() => guard(save)} disabled={busy || totalSave === 0}>
              {busy ? '저장 중…' : `${totalSave}건 저장하기`}
            </BigButton>
          )}
          <BigButton tone="secondary" onClick={() => guard(cancel)} disabled={busy}>
            그만두기
          </BigButton>
        </div>
      </div>
    );
  }

  // ── 2-A) 한 건씩 확인: 새로 등록 제안 ──
  if (step === 'review' && cur && cur.status === 'needsEnrollment') {
    const c = cur.candidates[0];
    const askQuarter = appConfig.enableQuarterSystem;
    const current = getCurrentQuarter();
    const quarterOpts = [...getQuarterOptions()].reverse(); // 최신 분기 먼저

    return (
      <div className="border-2 border-primary bg-card rounded-2xl p-5 text-foreground">
        <div className="text-base text-primary font-semibold mb-2">
          확인 {idx + 1} / {review.length}
        </div>
        <div className="text-2xl font-bold">{cur.payerName || '(이름 없는 입금)'}님</div>
        <div className="text-lg text-muted-foreground mb-3">
          {shortDate(cur.paidAt)} · {cur.method || '입금'} · {won(cur.amount)}
        </div>

        {!pickQuarter ? (
          <>
            <div className="text-lg mb-2">
              <b>{c?.courseName}</b> 강의에 새로 등록할까요?
            </div>
            <div className="bg-card border border-border rounded-xl p-3 mb-3 text-base">
              <div className="text-muted-foreground">
                이 분은 아직 <b className="text-foreground">{c?.courseName}</b> 강의에 등록돼 있지 않아요.
              </div>
              {c && c.amountMatches && (
                <div className="text-success mt-1">
                  입금액 {won(cur.amount)}이 수강료와 같아요.
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <BigButton
                tone="success"
                onClick={() => guard(() => (askQuarter ? setPickQuarter(true) : c && acceptEnroll(c)))}
                disabled={busy}
              >
                네, 새로 등록할게요
              </BigButton>
              <BigButton tone="ghost" onClick={() => guard(skip)} disabled={busy}>
                이 입금은 건너뛸게요
              </BigButton>
            </div>
          </>
        ) : (
          <>
            <div className="text-lg mb-2">어느 분기로 등록할까요?</div>
            <div className="flex flex-col gap-2">
              {quarterOpts.map((q) => (
                <BigButton
                  key={q.value}
                  tone={q.value === current ? 'success' : 'outline'}
                  onClick={() => guard(() => c && acceptEnroll(c, q.value))}
                  disabled={busy}
                >
                  {q.label}
                  {q.value === current ? ' (이번 분기)' : ''}
                </BigButton>
              ))}
              <BigButton tone="ghost" onClick={() => guard(() => setPickQuarter(false))} disabled={busy}>
                뒤로
              </BigButton>
            </div>
          </>
        )}
      </div>
    );
  }

  // ── 2-S) 한 건씩 확인: 여러 강의 합산 입금 나눠 저장 ──
  if (step === 'review' && cur && cur.status === 'needsSplit') {
    const parts = cur.candidates;
    return (
      <div className="border-2 border-warning-subtle bg-warning-subtle rounded-2xl p-5 text-foreground">
        <div className="text-base text-warning font-semibold mb-2">
          확인 {idx + 1} / {review.length}
        </div>
        <div className="text-2xl font-bold">{cur.payerName || '(이름 없는 입금)'}님</div>
        <div className="text-lg text-muted-foreground mb-3">
          {shortDate(cur.paidAt)} · {cur.method || '입금'} · {won(cur.amount)}
        </div>

        {!showAlt ? (
          <>
            <div className="text-lg mb-2">
              여러 강의에 한꺼번에 내신 것 같아요. 나눠서 저장할까요?
            </div>
            <div className="bg-card border border-border rounded-xl p-3 mb-3 text-base">
              <ul className="space-y-0.5">
                {parts.map((c) => (
                  <li key={c.enrollmentId}>
                    · {c.courseName} <b>{won(c.fee)}</b>
                  </li>
                ))}
              </ul>
              <div className="text-success mt-2">
                합쳐서 {won(parts.reduce((a, c) => a + c.fee, 0))} — 입금액과 같아요.
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <BigButton tone="success" onClick={() => guard(acceptSplit)} disabled={busy}>
                네, {parts.length}개 강의로 나눠서 저장할게요
              </BigButton>
              <BigButton tone="outline" onClick={() => guard(() => setShowAlt(true))} disabled={busy}>
                한 강의만 낸 거예요
              </BigButton>
              <BigButton tone="ghost" onClick={() => guard(skip)} disabled={busy}>
                이 입금은 건너뛸게요
              </BigButton>
            </div>
          </>
        ) : (
          <>
            <div className="text-lg mb-2">어느 강의에 내셨나요?</div>
            <div className="flex flex-col gap-2">
              {parts.map((c) => (
                <BigButton
                  key={c.enrollmentId}
                  tone="outline"
                  onClick={() => guard(() => accept(c.enrollmentId))}
                  disabled={busy}
                >
                  {c.courseName} ({won(c.fee)})
                </BigButton>
              ))}
              <BigButton tone="ghost" onClick={() => guard(skip)} disabled={busy}>
                이 입금은 건너뛸게요
              </BigButton>
            </div>
          </>
        )}
      </div>
    );
  }

  // ── 2-B) 한 건씩 확인: 기존 등록 중 선택 ──
  if (step === 'review' && cur) {
    const primary =
      cur.candidates.find((c) => c.enrollmentId === cur.enrollmentId) ?? cur.candidates[0];
    const hist = primary?.existingPayments ?? [];
    const ym = (s: string) => s.slice(0, 7); // YYYY-MM
    // 같은 날·같은 금액(정확 중복) 또는 같은 달·같은 금액(수동입력 등 날짜만 다른 중복 의심)
    const dupSameDay = hist.find((p) => p.paidAt === cur.paidAt && p.amount === cur.amount);
    const dupSameMonth = hist.find(
      (p) => ym(p.paidAt) === ym(cur.paidAt) && p.amount === cur.amount,
    );
    const isDupNow = !!(dupSameDay || dupSameMonth);

    return (
      <div className="border-2 border-warning-subtle bg-warning-subtle rounded-2xl p-5 text-foreground">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="text-base text-warning font-semibold">
            확인 {idx + 1} / {review.length}
          </div>
          {isDupNow && (
            <button
              onClick={() => guard(skipAllRemaining)}
              disabled={busy}
              className="text-sm text-muted-foreground underline shrink-0 disabled:opacity-50"
            >
              남은 것 전체 건너뛰기
            </button>
          )}
        </div>
        <div className="text-2xl font-bold">{cur.payerName || '(이름 없는 입금)'}님</div>
        <div className="text-lg text-muted-foreground mb-3">
          {shortDate(cur.paidAt)} · {cur.method || '입금'} · {won(cur.amount)}
        </div>

        {!showAlt && primary && (
          <>
            <div className="text-lg mb-2">
              <b>{primary.courseName}</b> 강의가 맞나요?
            </div>

            {/* 기존 결제 이력 — 사용자가 직접 중복 여부 판단 */}
            <div className="bg-card border border-border rounded-xl p-3 mb-3 text-base">
              {hist.length > 0 ? (
                <>
                  <div className="text-muted-foreground mb-1">
                    이미 받은 기록 ({primary.courseName})
                  </div>
                  <ul className="space-y-0.5">
                    {hist.slice(0, 5).map((p, i) => {
                      // 같은 달·같은 금액이면 강조 (날짜만 다른 중복도 눈에 띄게)
                      const same = ym(p.paidAt) === ym(cur.paidAt) && p.amount === cur.amount;
                      return (
                        <li
                          key={i}
                          className={same ? 'text-destructive font-bold' : 'text-foreground'}
                        >
                          · {shortDate(p.paidAt)} {won(p.amount)}
                        </li>
                      );
                    })}
                  </ul>
                  {dupSameDay ? (
                    <div className="text-destructive font-medium mt-2">
                      ⚠ 이번 {shortDate(cur.paidAt)} {won(cur.amount)}은 이미 받은 것 같아요
                    </div>
                  ) : dupSameMonth ? (
                    <div className="text-destructive font-medium mt-2">
                      ⚠ 같은 달에 {won(cur.amount)}을 이미 받은 기록이 있어요 (
                      {shortDate(dupSameMonth.paidAt)}). 날짜만 다를 수 있어요.
                    </div>
                  ) : (
                    <div className="text-success mt-2">
                      이번 {shortDate(cur.paidAt)} 입금은 새 기록이에요
                    </div>
                  )}
                </>
              ) : (
                <div className="text-muted-foreground">아직 이 강의 결제 기록이 없어요</div>
              )}
            </div>

            {/* 중복으로 의심되면 '건너뛰기'를 가장 크게, '저장'은 작게 — 실수 저장 방지 */}
            {isDupNow ? (
              <div className="flex flex-col gap-2">
                <BigButton tone="primary" onClick={() => guard(skip)} disabled={busy}>
                  건너뛰기 (이미 받은 입금이에요)
                </BigButton>
                {cur.candidates.length > 1 && (
                  <BigButton tone="outline" onClick={() => guard(() => setShowAlt(true))} disabled={busy}>
                    다른 강의예요
                  </BigButton>
                )}
                <BigButton tone="ghost" onClick={() => guard(() => accept(primary.enrollmentId))} disabled={busy}>
                  그래도 저장할게요
                </BigButton>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <BigButton tone="success" onClick={() => guard(() => accept(primary.enrollmentId))} disabled={busy}>
                  네, 맞아요
                </BigButton>
                {cur.candidates.length > 1 && (
                  <BigButton tone="outline" onClick={() => guard(() => setShowAlt(true))} disabled={busy}>
                    다른 강의예요
                  </BigButton>
                )}
                <BigButton tone="ghost" onClick={() => guard(skip)} disabled={busy}>
                  이 입금은 건너뛸게요
                </BigButton>
              </div>
            )}
          </>
        )}

        {showAlt && (
          <>
            <div className="text-lg mb-2">어느 강의에 내셨나요?</div>
            <div className="flex flex-col gap-2">
              {cur.candidates.map((c) => {
                const ch = c.existingPayments ?? [];
                return (
                  <BigButton
                    key={c.enrollmentId}
                    tone="outline"
                    onClick={() => guard(() => accept(c.enrollmentId))}
                    disabled={busy}
                  >
                    <div>
                      {c.studentName} · {c.courseName} ({won(c.fee)})
                    </div>
                    {ch.length > 0 && (
                      <div className="text-sm text-muted-foreground mt-0.5">
                        이미 받은 날: {ch.slice(0, 3).map((p) => shortDate(p.paidAt)).join(', ')}
                      </div>
                    )}
                  </BigButton>
                );
              })}
              <BigButton tone="ghost" onClick={() => guard(skip)} disabled={busy}>
                이 입금은 건너뛸게요
              </BigButton>
            </div>
          </>
        )}
      </div>
    );
  }

  // ── 3) 마무리 ──
  const decisionVals = Object.values(decisions);
  const confirmedNew = decisionVals.filter((d) => d.newEnrollment).length;
  const confirmedExisting = confirmedRecords - confirmedNew;
  return (
    <div className="border-2 border-border bg-card rounded-2xl p-5 text-foreground">
      <div className="text-xl font-bold mb-3">확인이 끝났어요!</div>
      <ul className="text-lg space-y-1.5 mb-4">
        <li>바로 저장 <b>{autoSaveCount}건</b></li>
        {confirmedExisting > 0 && <li>확인해서 저장 <b>{confirmedExisting}건</b></li>}
        {confirmedNew > 0 && (
          <li className="text-primary">새로 등록하고 저장 <b>{confirmedNew}건</b></li>
        )}
        <li className="text-success">모두 <b>{totalSave}건</b> 저장할게요</li>
      </ul>
      <div className="flex flex-col sm:flex-row gap-2">
        <BigButton tone="primary" onClick={() => guard(save)} disabled={busy || totalSave === 0}>
          {busy ? '저장 중…' : `${totalSave}건 저장하기`}
        </BigButton>
        <BigButton tone="secondary" onClick={() => guard(cancel)} disabled={busy}>
          그만두기
        </BigButton>
      </div>
    </div>
  );
}
