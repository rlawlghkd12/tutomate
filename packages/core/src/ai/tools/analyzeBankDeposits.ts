import { z } from 'zod';
import { supabase } from '../../config/supabase';
import { getCurrentQuarter, getPreviousQuarter, getQuarterForDate } from '../../utils/quarterUtils';
import { parseBankExcel } from '../bank/parseBankExcel';
import {
  matchDeposits,
  toPreviewItem,
  norm,
  type MatchCandidate,
  type BankDepositPreviewItem,
} from '../bank/depositMatcher';
import type { ToolHandler, SmartCard } from '../types';

const schema = z.object({
  fileId: z.string().describe('첨부된 은행 거래내역 엑셀의 fileId'),
});

/**
 * 은행 거래내역 엑셀(입금/출금)을 분석해 수강생·강좌·금액과 매칭하고 미리보기 카드를 띄운다.
 * - 입금: 수강생·강좌·금액 매칭 (auto/needsConfirm/needsEnrollment/needsSplit)
 * - 출금: 낸 기록이 있는 수강생 환불 후보 (needsRefund, 항상 확인)
 * 매칭·중복확인은 현재 분기 등록(enrollment) 기준으로 하되(분기 없는 일반 버전 데이터는 전체),
 * 직전 분기 등록은 재수강 감지에 쓴다 — 지난 분기 수강생이 이번 분기 미등록이면
 * '신규 등록'으로 단정하지 않고 '지난 분기 등록에 저장' 선택지도 함께 제시한다.
 * 저장은 하지 않는다 — 사용자가 카드에서 [확정]을 눌러야 confirmBankDeposits가 실행된다.
 */
export const analyzeBankDeposits: ToolHandler<typeof schema> = {
  name: 'analyzeBankDeposits',
  description:
    '은행 거래내역 엑셀(입금/출금)을 분석해 입금은 수강생·강좌·금액과 매칭하고, 출금은 환불 후보로 제시한다. ' +
    '입금자명이 "강좌+이름"이면 자동 매칭(auto), "이름만"·동명이인·금액불일치는 확인 후보(needsConfirm). ' +
    '출금은 낸 기록이 있는 수강생만 환불 후보(needsRefund)로 올린다. 현재 분기 기준으로만 매칭하며 저장은 하지 않는다.',
  schema,
  async execute({ fileId }, ctx) {
    if (!ctx.fileStash) throw new Error('첨부 파일을 찾을 수 없습니다.');
    if (!supabase) throw new Error('데이터베이스에 연결할 수 없습니다.');

    const buf = await ctx.fileStash.read(fileId);
    const parsed = parseBankExcel(new Uint8Array(buf));
    if (parsed.deposits.length === 0 && parsed.withdrawals.length === 0) {
      return { error: '입금/출금 내역을 찾지 못했습니다. 거래내역 엑셀이 맞는지 확인해주세요.' };
    }

    const [coursesRes, studentsRes, enrollsRes] = await Promise.all([
      supabase.from('courses').select('id, name, fee'),
      supabase.from('students').select('id, name'),
      supabase.from('enrollments').select('id, student_id, course_id, quarter'),
    ]);
    if (coursesRes.error) throw new Error(coursesRes.error.message);
    if (studentsRes.error) throw new Error(studentsRes.error.message);
    if (enrollsRes.error) throw new Error(enrollsRes.error.message);

    // 현재 분기로 제한 — '2분기 정리'면 1분기 등록/결제는 보지 않는다.
    // (분기 없는 데이터=일반 버전은 그대로 통과시켜 양쪽 앱 모두 안전)
    // 단, 직전 분기 등록은 '재수강 감지'용으로 따로 넘긴다 — 지난 분기 수강생이
    // 이번 분기 미등록이라고 무조건 '신규'로 뜨지 않고, 지난 분기 등록에 저장하는 선택지를 준다.
    const targetQuarter = getCurrentQuarter();
    const prevQuarter = getPreviousQuarter(targetQuarter);
    const courses = (coursesRes.data ?? []).map((c: any) => ({
      id: c.id,
      name: c.name,
      fee: c.fee ?? 0,
    }));
    const students = (studentsRes.data ?? []).map((s: any) => ({ id: s.id, name: s.name }));
    const allEnrolls = enrollsRes.data ?? [];
    const enrollments = allEnrolls
      .filter((e: any) => !e.quarter || e.quarter === targetQuarter)
      .map((e: any) => ({ id: e.id, studentId: e.student_id, courseId: e.course_id }));
    const prevEnrollments = allEnrolls
      .filter((e: any) => e.quarter === prevQuarter)
      .map((e: any) => ({ id: e.id, studentId: e.student_id, courseId: e.course_id }));

    // ── 입금 매칭 ──
    const matches = matchDeposits(parsed.deposits, { courses, students, enrollments, prevEnrollments });
    const items = matches.map(toPreviewItem);

    // ── 출금(환불) 후보: 출금 적요에 수강생 이름이 잡히면 그 학생의 현재 분기 등록을 후보로 ──
    const courseById = new Map(courses.map((c) => [c.id, c]));
    const enrollsByStudent = new Map<string, { enrollmentId: string; course: typeof courses[number] }[]>();
    for (const e of enrollments) {
      const c = courseById.get(e.courseId);
      if (!c) continue;
      const arr = enrollsByStudent.get(e.studentId) ?? [];
      arr.push({ enrollmentId: e.id, course: c });
      enrollsByStudent.set(e.studentId, arr);
    }
    type RefundEnroll = { enrollmentId: string; studentId: string; studentName: string; course: typeof courses[number] };
    const refundPlan: { tx: (typeof parsed.withdrawals)[number]; enrolls: RefundEnroll[] }[] = [];
    for (const w of parsed.withdrawals) {
      const wNorm = norm(w.payerName);
      if (!wNorm) continue;
      const hitStudents = students
        .filter((s) => s.name && wNorm.includes(norm(s.name)))
        .sort((a, b) => b.name.length - a.name.length);
      const enrolls: RefundEnroll[] = [];
      const seen = new Set<string>();
      for (const s of hitStudents) {
        for (const en of enrollsByStudent.get(s.id) ?? []) {
          if (seen.has(en.enrollmentId)) continue;
          seen.add(en.enrollmentId);
          enrolls.push({ enrollmentId: en.enrollmentId, studentId: s.id, studentName: s.name, course: en.course });
        }
      }
      if (enrolls.length > 0) refundPlan.push({ tx: w, enrolls });
    }

    // ── 결제 이력 한 번에 조회 (입금 후보 ∪ 환불 후보 등록) ──
    const allEnrollmentIds = Array.from(
      new Set([
        // 재수강 후보는 enrollmentId가 빈 문자열이고 priorEnrollmentId(지난 분기)에 이력이 있다
        ...items.flatMap((i) => i.candidates.flatMap((c) => [c.enrollmentId, c.priorEnrollmentId])),
        ...refundPlan.flatMap((p) => p.enrolls.map((e) => e.enrollmentId)),
      ]),
    ).filter((id): id is string => Boolean(id));

    const ym = (s: string) => String(s).slice(0, 7); // YYYY-MM
    const byEnrollment = new Map<string, { paidAt: string; amount: number }[]>();
    const existKey = new Set<string>(); // 같은 날·같은 금액 (정확 중복)
    const monthKey = new Set<string>(); // 같은 달·같은 금액 (수동입력 등 날짜만 다른 중복 의심)
    if (allEnrollmentIds.length > 0) {
      const { data: existing } = await supabase
        .from('payment_records')
        .select('enrollment_id, paid_at, amount')
        .in('enrollment_id', allEnrollmentIds);
      for (const e of existing ?? []) {
        const eid = (e as any).enrollment_id;
        const paidAt = (e as any).paid_at;
        const amount = (e as any).amount;
        const arr = byEnrollment.get(eid) ?? [];
        arr.push({ paidAt, amount });
        byEnrollment.set(eid, arr);
        existKey.add(`${eid}|${paidAt}|${amount}`);
        monthKey.add(`${eid}|${ym(paidAt)}|${amount}`);
      }
    }

    // 입금 후보에 이력 주입 + 정기 반복(recurring) 판정 + 중복 처리
    for (const it of items) {
      for (const c of it.candidates) {
        // 재수강 후보는 지난 분기 등록(priorEnrollmentId)의 결제 이력을 보여준다.
        const eid = c.enrollmentId || c.priorEnrollmentId;
        const hist = eid ? byEnrollment.get(eid) : undefined;
        if (hist && hist.length > 0) {
          c.existingPayments = [...hist].sort((a, b) => (a.paidAt < b.paidAt ? 1 : -1));
          // 직전 '다른 달'에 같은 금액을 낸 정기 수강료 패턴 (같은 달=중복 의심이라 제외)
          c.recurring = hist.some(
            (p) => p.amount === it.amount && ym(p.paidAt) !== ym(it.paidAt) && p.paidAt < it.paidAt,
          );
        }
      }
      // 정기 반복 후보가 딱 하나면 1순위로 올려 "지난달에도…" 라벨을 보여준다(이름만 입금의 매달 확인 부담↓).
      if (it.status === 'needsConfirm') {
        const rec = it.candidates.filter((c) => c.recurring);
        if (rec.length === 1) {
          const r = rec[0];
          it.candidates = [r, ...it.candidates.filter((c) => c !== r)];
          it.enrollmentId = r.enrollmentId;
          it.studentName = r.studentName;
          it.courseName = r.courseName;
          it.reason = '지난달에도 같은 금액을 이 강좌에 내셨어요 — 정기 수강료로 보임';
        }
      }
      if (!it.enrollmentId) continue;
      const exact = existKey.has(`${it.enrollmentId}|${it.paidAt}|${it.amount}`);
      if (exact) {
        it.duplicate = true;
      } else if (
        it.status === 'auto' &&
        monthKey.has(`${it.enrollmentId}|${ym(it.paidAt)}|${it.amount}`)
      ) {
        it.status = 'needsConfirm';
        it.reason = '같은 달에 같은 금액을 이미 받은 기록이 있어 확인 필요';
      }
    }

    // ── 환불 후보 항목 구성: '낸 기록(양수 결제)이 있는' 등록만 후보로 (보수적) ──
    const refundItems: BankDepositPreviewItem[] = [];
    for (const p of refundPlan) {
      const cands: MatchCandidate[] = [];
      for (const e of p.enrolls) {
        const hist = byEnrollment.get(e.enrollmentId) ?? [];
        const positive = hist.filter((h) => h.amount > 0);
        if (positive.length === 0) continue; // 낸 기록이 없으면 환불 후보 아님
        cands.push({
          enrollmentId: e.enrollmentId,
          studentId: e.studentId,
          studentName: e.studentName,
          courseId: e.course.id,
          courseName: e.course.name,
          fee: e.course.fee,
          amountMatches: positive.some((h) => h.amount === p.tx.amount),
          existingPayments: [...hist].sort((a, b) => (a.paidAt < b.paidAt ? 1 : -1)),
        });
      }
      if (cands.length === 0) continue;
      const top = cands.find((c) => c.amountMatches) ?? cands[0];
      refundItems.push({
        rowIndex: p.tx.rowIndex,
        payerName: p.tx.payerName,
        amount: p.tx.amount,
        paidAt: p.tx.paidAt,
        method: p.tx.method,
        status: 'needsRefund',
        reason: '출금 — 환불로 저장할지 확인 필요',
        enrollmentId: top.enrollmentId,
        studentName: top.studentName,
        courseName: cands.length === 1 ? cands[0].courseName : undefined,
        candidates: cands,
      });
    }

    const allItems = [...items, ...refundItems];

    // 거래 날짜(다수결)로 이 거래내역의 분기를 추정 — 현재 분기와 다르면 카드가 저장 분기를 먼저 묻는다.
    const quarterCount = new Map<string, number>();
    for (const t of [...parsed.deposits, ...parsed.withdrawals]) {
      if (!t.paidAt) continue;
      const q = getQuarterForDate(t.paidAt);
      quarterCount.set(q, (quarterCount.get(q) ?? 0) + 1);
    }
    const dataQuarter = [...quarterCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

    const summary = {
      total: allItems.length,
      auto: allItems.filter((i) => i.status === 'auto').length,
      needsConfirm: allItems.filter((i) => i.status === 'needsConfirm').length,
      needsEnrollment: allItems.filter((i) => i.status === 'needsEnrollment').length,
      needsSplit: allItems.filter((i) => i.status === 'needsSplit').length,
      needsRefund: refundItems.length,
      unmatched: allItems.filter((i) => i.status === 'unmatched').length,
      duplicate: allItems.filter((i) => i.duplicate).length,
      accountName: parsed.accountName,
      period: parsed.period,
    };

    const card: SmartCard = { type: 'bankDepositPreview', fileId, dataQuarter, summary, items: allItems };
    ctx.emit?.(card);

    // LLM에는 요약 + 확인 필요/미매칭 건 일부만 (전체 items는 카드로 갔으므로 토큰 절약)
    return {
      summary,
      needsConfirmSamples: allItems
        .filter((i) => i.status === 'needsConfirm')
        .slice(0, 10)
        .map((i) => ({ payer: i.payerName, amount: i.amount, reason: i.reason })),
      refundSamples: refundItems
        .slice(0, 10)
        .map((i) => ({ payer: i.payerName, amount: i.amount })),
      unmatchedSamples: allItems
        .filter((i) => i.status === 'unmatched')
        .slice(0, 10)
        .map((i) => ({ payer: i.payerName, amount: i.amount, reason: i.reason })),
    };
  },
};
