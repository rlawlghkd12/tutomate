import { useEffect, useRef, useState, type ButtonHTMLAttributes } from 'react';
import type { SmartCard, MatchCandidate, DepositSelection } from '@tutomate/core';
import { appConfig, getCurrentQuarter, getPreviousQuarter, getQuarterLabel } from '@tutomate/core';

type Card = Extract<SmartCard, { type: 'bankDepositPreview' }>;
type Props = Card & {
  onConfirm: (selections: DepositSelection[]) => void;
  onCancel: () => void;
};

type Decision = {
  enrollmentId?: string;
  newEnrollment?: { studentId: string; courseId: string; quarter?: string };
  split?: { enrollmentId: string; amount: number }[];
  refund?: { enrollmentId: string; amount: number };
  /** '전체 추천대로' 일괄 적용 건 — 확정 시 중복 검사를 적용받게 한다 */
  viaRecommend?: boolean;
};

const won = (n: number) => n.toLocaleString('ko-KR') + '원';
function shortDate(iso: string): string {
  const m = iso.match(/^\d{4}-(\d{2})-(\d{2})/);
  return m ? `${Number(m[1])}월 ${Number(m[2])}일` : iso;
}

// 입금액과 수강료 관계 라벨 (수수료차감/부분/초과). 정확 일치·미상은 라벨 없음.
function amountLabel(c: MatchCandidate | undefined, amount: number): { text: string; tone: string } | null {
  const note = c?.amountNote;
  if (!c || !note || note === 'exact') return null;
  if (note === 'feeDeducted')
    return { text: `수수료 빼고 딱 맞아요 (수강료 ${won(c.fee)})`, tone: 'text-success' };
  if (note === 'partial')
    return { text: `부분 납부 · 남은 금액 ${won(Math.max(0, c.fee - amount))}`, tone: 'text-warning' };
  return { text: `수강료(${won(c.fee)})보다 많이 들어왔어요`, tone: 'text-warning' };
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
export function BankDepositPreviewCard({ summary, items, dataQuarter, onConfirm, onCancel }: Props) {
  const auto = items.filter((i) => i.status === 'auto');
  // 확인이 필요한 건(직접 선택) + 새로 등록할 건을 한 흐름에서 한 건씩 처리
  const review = items.filter(
    (i) =>
      i.status === 'needsConfirm' ||
      i.status === 'needsEnrollment' ||
      i.status === 'needsSplit' ||
      i.status === 'needsRefund',
  );
  const unmatched = items.filter((i) => i.status === 'unmatched');
  const newEnrollCount = items.filter((i) => i.status === 'needsEnrollment').length;
  const splitCount = items.filter((i) => i.status === 'needsSplit').length;
  const refundCount = items.filter((i) => i.status === 'needsRefund').length;
  // 재수강생(지난 분기 이력 있음) — 이번/지난 분기 선택이 애매해 '전체 추천대로'에서 제외하고 건별로만 확인한다.
  const returningRows = review.filter(
    (i) => i.status === 'needsEnrollment' && !!i.candidates[0]?.priorEnrollmentId,
  );

  const [step, setStep] = useState<'intro' | 'review' | 'ready'>('intro');
  const [idx, setIdx] = useState(0);
  const [decisions, setDecisions] = useState<Record<number, Decision>>({});
  const [showAlt, setShowAlt] = useState(false);
  const [busy, setBusy] = useState(false);
  // 벌크 처리 후 '남은 재수강 건만' 건별 확인하는 모드
  const [reviewingRemainder, setReviewingRemainder] = useState(false);

  // 새 등록을 어느 분기로 저장할지. 거래 날짜가 지난 분기면 시작할 때 한 번 물어본다(조회 분기와 무관).
  const currentQuarter = getCurrentQuarter();
  const [targetQuarter, setTargetQuarter] = useState(currentQuarter);
  const [quarterChosen, setQuarterChosen] = useState(false);
  const askDataQuarter =
    appConfig.enableQuarterSystem && !!dataQuarter && dataQuarter !== currentQuarter;

  // 화면이 바뀌기 전 같은 버튼이 두 번 처리되는 것(더블클릭)을 막는 잠금.
  // idx/step이 바뀌어 새 화면이 렌더되면 자동 해제된다.
  const navLock = useRef(false);
  useEffect(() => {
    navLock.current = false;
  }, [idx, step, showAlt, quarterChosen]);
  function guard(fn: () => void) {
    if (navLock.current || busy) return;
    navLock.current = true;
    fn();
  }

  // 일반 확인은 review 전체를, 벌크 후 잔여 모드에서는 재수강 건만 순회한다.
  const activeList = reviewingRemainder ? returningRows : review;
  const cur = activeList[idx];
  // 합산 분할은 한 건의 결정이 여러 결제로 저장되므로 '저장될 기록 수'로 센다.
  const recordsOf = (d: Decision) => (d.split ? d.split.length : 1);
  const confirmedRecords = Object.values(decisions).reduce((a, d) => a + recordsOf(d), 0);
  const autoSaveCount = auto.filter((i) => !i.duplicate).length;
  const totalSave = autoSaveCount + confirmedRecords;

  function goNext() {
    setShowAlt(false);
    if (idx + 1 < activeList.length) setIdx(idx + 1);
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
  function acceptRefund(c: MatchCandidate) {
    setDecisions((d) => ({
      ...d,
      [cur.rowIndex]: { refund: { enrollmentId: c.enrollmentId, amount: cur.amount } },
    }));
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
      for (let i = idx; i < activeList.length; i++) delete n[activeList[i].rowIndex];
      return n;
    });
    setShowAlt(false);
    setStep('ready');
  }
  // 확인이 필요한 모든 건을 각 카드의 '1순위 추천 액션'으로 한 번에 처리하고 마무리로 이동.
  // 중복 의심 건(같은 달·같은 금액 기록 있음)은 카드 추천이 '건너뛰기'이므로 저장에서 제외한다.
  // 저장 전 마무리 화면에서 카테고리별 건수(새 등록·환불 포함)를 다시 확인할 수 있다.
  function acceptAllRecommended() {
    const newQuarter = appConfig.enableQuarterSystem ? targetQuarter : undefined;
    const ym = (s: string) => s.slice(0, 7); // YYYY-MM
    const next: Record<number, Decision> = {};
    for (const it of review) {
      if (it.status === 'needsEnrollment') {
        const c = it.candidates[0];
        if (!c) continue;
        // 재수강(지난 분기 이력)은 이번/지난 분기 선택이 애매 → 벌크 제외, 아래에서 건별 확인
        if (c.priorEnrollmentId) continue;
        next[it.rowIndex] = { newEnrollment: { studentId: c.studentId, courseId: c.courseId, quarter: newQuarter }, viaRecommend: true };
      } else if (it.status === 'needsSplit') {
        const split = it.candidates.map((c) => ({ enrollmentId: c.enrollmentId, amount: c.fee }));
        if (split.length > 0) next[it.rowIndex] = { split, viaRecommend: true };
      } else if (it.status === 'needsRefund') {
        const c = it.candidates.find((x) => x.amountMatches) ?? it.candidates[0];
        if (c) next[it.rowIndex] = { refund: { enrollmentId: c.enrollmentId, amount: it.amount }, viaRecommend: true };
      } else {
        // needsConfirm — 1순위 후보에 저장 (중복 의심이면 추천이 '건너뛰기'이므로 제외)
        const primary = it.candidates.find((c) => c.enrollmentId === it.enrollmentId) ?? it.candidates[0];
        if (!primary || !primary.enrollmentId) continue;
        const hist = primary.existingPayments ?? [];
        const dup = hist.some(
          (p) => (p.paidAt === it.paidAt || ym(p.paidAt) === ym(it.paidAt)) && p.amount === it.amount,
        );
        if (dup) continue;
        next[it.rowIndex] = { enrollmentId: primary.enrollmentId, viaRecommend: true };
      }
    }
    setDecisions(next);
    setShowAlt(false);
    // 재수강 건이 남아 있으면 그것만 건별로 확인, 없으면 바로 마무리.
    if (returningRows.length > 0) {
      setReviewingRemainder(true);
      setIdx(0);
      setStep('review');
    } else {
      setStep('ready');
    }
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

  // ── 0) 저장 분기 선택 — 거래 날짜가 지난 분기면 먼저 어느 분기에 저장할지 묻는다 ──
  if (step === 'intro' && askDataQuarter && !quarterChosen) {
    const pick = (q: string) => {
      setTargetQuarter(q);
      setQuarterChosen(true);
    };
    return (
      <div className="border-2 border-warning bg-warning-subtle rounded-2xl p-5 text-foreground">
        <div className="text-xl font-bold mb-2">어느 분기에 저장할까요?</div>
        <div className="text-lg text-muted-foreground mb-4">
          이 거래내역은 <b className="text-foreground">{getQuarterLabel(dataQuarter!)}</b> 자료로 보여요.
          지난 분기 자료면 그 분기에 저장할 수 있어요.
        </div>
        <div className="flex flex-col gap-2">
          <BigButton tone="success" onClick={() => guard(() => pick(dataQuarter!))} disabled={busy}>
            {getQuarterLabel(dataQuarter!)}에 저장할게요 (거래내역 기준)
          </BigButton>
          <BigButton tone="outline" onClick={() => guard(() => pick(currentQuarter))} disabled={busy}>
            이번 {getQuarterLabel(currentQuarter)}에 저장할게요
          </BigButton>
          <BigButton tone="ghost" onClick={() => guard(cancel)} disabled={busy}>
            그만두기
          </BigButton>
        </div>
      </div>
    );
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
          {review.length - newEnrollCount - splitCount - refundCount > 0 && (
            <li>
              <span className="text-warning font-bold">●</span> 같이 확인할 입금{' '}
              <b className="text-warning">{review.length - newEnrollCount - splitCount - refundCount}건</b>
            </li>
          )}
          {splitCount > 0 && (
            <li>
              <span className="text-warning font-bold">●</span> 여러 강의 합산 입금{' '}
              <b className="text-warning">{splitCount}건</b>
            </li>
          )}
          {refundCount > 0 && (
            <li>
              <span className="text-destructive font-bold">●</span> 환불(출금)로 확인할 건{' '}
              <b className="text-destructive">{refundCount}건</b>
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
        <div className="flex flex-col gap-2">
          {review.length > 0 ? (
            <>
              <BigButton
                tone="primary"
                onClick={() => guard(() => { setReviewingRemainder(false); setIdx(0); setStep('review'); })}
                disabled={busy}
              >
                {review.length}건 하나씩 확인하기
              </BigButton>
              <BigButton tone="outline" onClick={() => guard(acceptAllRecommended)} disabled={busy}>
                전체 추천대로 처리하기
              </BigButton>
            </>
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
  //   재수강(지난 분기 이력 있음)이면 '이번 분기 새 등록' / '지난 분기 등록에 저장'을 함께 제시한다.
  if (step === 'review' && cur && cur.status === 'needsEnrollment') {
    const c = cur.candidates[0];
    const withQuarter = appConfig.enableQuarterSystem;
    const current = getCurrentQuarter();
    const prevQ = getPreviousQuarter(current);
    // 분기 시스템이 없는 일반 버전은 quarter 없이 등록 (기존 동작 유지)
    const newQuarter = withQuarter ? targetQuarter : undefined;
    const targetLabel = getQuarterLabel(targetQuarter);
    const targetPrefix = targetQuarter === current ? '이번 ' : '';
    const returning = withQuarter && !!c?.priorEnrollmentId;
    const priorPays = c?.existingPayments ?? [];

    return (
      <div className="border-2 border-primary bg-card rounded-2xl p-5 text-foreground">
        <div className="text-base text-primary font-semibold mb-2">
          확인 {idx + 1} / {activeList.length}
        </div>
        <div className="text-2xl font-bold">{cur.payerName || '(이름 없는 입금)'}님</div>
        <div className="text-lg text-muted-foreground mb-3">
          {shortDate(cur.paidAt)} · {cur.method || '입금'} · {won(cur.amount)}
        </div>

        {returning ? (
          <>
            <div className="text-lg mb-2">
              이번 {getQuarterLabel(current)}엔 <b>{c?.courseName}</b> 등록이 없어요.
            </div>
            <div className="bg-card border border-border rounded-xl p-3 mb-3 text-base">
              <div className="text-muted-foreground mb-1">
                지난 {getQuarterLabel(prevQ)}에 <b className="text-foreground">{c?.courseName}</b> 수강 이력이 있어요.
              </div>
              {priorPays.length > 0 && (
                <ul className="space-y-0.5">
                  {priorPays.slice(0, 5).map((p, i) => (
                    <li key={i} className={p.amount === cur.amount ? 'text-foreground font-bold' : 'text-foreground'}>
                      · {shortDate(p.paidAt)} {won(p.amount)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <BigButton tone="success" onClick={() => guard(() => c && acceptEnroll(c, newQuarter))} disabled={busy}>
                {targetPrefix}{targetLabel}에 새로 등록할게요
              </BigButton>
              <BigButton
                tone="outline"
                onClick={() => guard(() => c?.priorEnrollmentId && accept(c.priorEnrollmentId))}
                disabled={busy}
              >
                지난 {getQuarterLabel(prevQ)} 등록에 저장할게요
              </BigButton>
              <BigButton tone="ghost" onClick={() => guard(skip)} disabled={busy}>
                이 입금은 건너뛸게요
              </BigButton>
            </div>
          </>
        ) : (
          <>
            <div className="text-lg mb-2">
              <b>{c?.courseName}</b> 강의에 새로 등록할까요?
            </div>
            <div className="bg-card border border-border rounded-xl p-3 mb-3 text-base">
              <div className="text-muted-foreground">
                이 분은 아직 <b className="text-foreground">{c?.courseName}</b> 강의에 등록돼 있지 않아요.
              </div>
              {c && c.amountMatches ? (
                <div className="text-success mt-1">입금액 {won(cur.amount)}이 수강료와 같아요.</div>
              ) : (
                (() => {
                  const l = amountLabel(c, cur.amount);
                  return l ? <div className={`${l.tone} mt-1`}>{l.text}</div> : null;
                })()
              )}
            </div>
            <div className="flex flex-col gap-2">
              <BigButton tone="success" onClick={() => guard(() => c && acceptEnroll(c, newQuarter))} disabled={busy}>
                {withQuarter ? `${targetPrefix}${targetLabel}에 새로 등록할게요` : '네, 새로 등록할게요'}
              </BigButton>
              <BigButton tone="ghost" onClick={() => guard(skip)} disabled={busy}>
                이 입금은 건너뛸게요
              </BigButton>
            </div>
          </>
        )}
      </div>
    );
  }

  // ── 2-R) 한 건씩 확인: 출금 → 환불 저장 ──
  if (step === 'review' && cur && cur.status === 'needsRefund') {
    const parts = cur.candidates;
    const single = parts.length === 1 ? parts[0] : null;
    return (
      <div className="border-2 border-error-subtle bg-error-subtle rounded-2xl p-5 text-foreground">
        <div className="text-base text-destructive font-semibold mb-2">
          확인 {idx + 1} / {activeList.length}
        </div>
        <div className="text-2xl font-bold">{cur.payerName || '(이름 없는 출금)'}님</div>
        <div className="text-lg text-muted-foreground mb-3">
          {shortDate(cur.paidAt)} · {cur.method || '출금'} · <b className="text-destructive">{won(cur.amount)} 출금</b>
        </div>

        <div className="text-lg mb-2">이 출금이 환불인가요?</div>
        {single ? (
          <>
            <div className="bg-card border border-border rounded-xl p-3 mb-3 text-base">
              <div className="text-muted-foreground mb-1">
                {single.studentName} · {single.courseName} — 이미 받은 기록
              </div>
              <ul className="space-y-0.5">
                {(single.existingPayments ?? []).slice(0, 5).map((p, i) => (
                  <li key={i} className={p.amount === cur.amount ? 'text-foreground font-bold' : 'text-foreground'}>
                    · {shortDate(p.paidAt)} {won(p.amount)}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex flex-col gap-2">
              <BigButton tone="primary" onClick={() => guard(() => acceptRefund(single))} disabled={busy}>
                네, {won(cur.amount)} 환불로 저장할게요
              </BigButton>
              <BigButton tone="ghost" onClick={() => guard(skip)} disabled={busy}>
                환불 아니에요 (건너뛰기)
              </BigButton>
            </div>
          </>
        ) : (
          <>
            <div className="text-base text-muted-foreground mb-2">어느 강의 환불인가요?</div>
            <div className="flex flex-col gap-2">
              {parts.map((c) => {
                const ch = c.existingPayments ?? [];
                return (
                  <BigButton
                    key={c.enrollmentId}
                    tone="outline"
                    onClick={() => guard(() => acceptRefund(c))}
                    disabled={busy}
                  >
                    <div>
                      {c.studentName} · {c.courseName}
                    </div>
                    {ch.length > 0 && (
                      <div className="text-sm text-muted-foreground mt-0.5">
                        받은 기록: {ch.slice(0, 3).map((p) => `${shortDate(p.paidAt)} ${won(p.amount)}`).join(', ')}
                      </div>
                    )}
                  </BigButton>
                );
              })}
              <BigButton tone="ghost" onClick={() => guard(skip)} disabled={busy}>
                환불 아니에요 (건너뛰기)
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
          확인 {idx + 1} / {activeList.length}
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
    const amtLabel = amountLabel(primary, cur.amount);
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
            확인 {idx + 1} / {activeList.length}
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

        {/* 연결할 수강 후보가 없는 건 — 예전엔 버튼이 하나도 안 그려져 막다른 상태였다.
            항상 건너뛰기(개별/전체)를 제공해 흐름이 멈추지 않게 한다. */}
        {!primary && (
          <div className="flex flex-col gap-2">
            <div className="bg-card border border-border rounded-xl p-3 mb-1 text-base text-muted-foreground">
              이 입금과 연결할 수강 정보를 찾지 못했어요. 건너뛰고 계속하실 수 있어요.
            </div>
            <BigButton tone="primary" onClick={() => guard(skip)} disabled={busy}>
              이 입금은 건너뛸게요
            </BigButton>
            <BigButton tone="ghost" onClick={() => guard(skipAllRemaining)} disabled={busy}>
              남은 것 전체 건너뛰기
            </BigButton>
          </div>
        )}

        {!showAlt && primary && (
          <>
            <div className="text-lg mb-2">
              <b>{primary.courseName}</b> 강의가 맞나요?
            </div>

            {/* 정기 수강료(지난달에도 같은 금액) — 매달 반복 확인 부담을 줄이는 힌트 */}
            {primary.recurring && (
              <div className="text-base text-success font-medium mb-2">
                🔁 지난달에도 이 금액을 여기에 내셨어요 (정기 수강료)
              </div>
            )}
            {/* 금액 관계 라벨 (수수료 차감·부분 납부·초과) */}
            {amtLabel && <div className={`text-base ${amtLabel.tone} font-medium mb-2`}>{amtLabel.text}</div>}

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
  const confirmedRefunds = decisionVals.filter((d) => d.refund).length;
  const confirmedExisting = confirmedRecords - confirmedNew - confirmedRefunds;
  return (
    <div className="border-2 border-border bg-card rounded-2xl p-5 text-foreground">
      <div className="text-xl font-bold mb-3">확인이 끝났어요!</div>
      <ul className="text-lg space-y-1.5 mb-4">
        <li>바로 저장 <b>{autoSaveCount}건</b></li>
        {confirmedExisting > 0 && <li>확인해서 저장 <b>{confirmedExisting}건</b></li>}
        {confirmedNew > 0 && (
          <li className="text-primary">새로 등록하고 저장 <b>{confirmedNew}건</b></li>
        )}
        {confirmedRefunds > 0 && (
          <li className="text-destructive">환불 처리 <b>{confirmedRefunds}건</b></li>
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
