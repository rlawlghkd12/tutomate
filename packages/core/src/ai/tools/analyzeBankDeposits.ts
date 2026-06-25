import { z } from 'zod';
import { supabase } from '../../config/supabase';
import { parseBankExcel } from '../bank/parseBankExcel';
import { matchDeposits, toPreviewItem } from '../bank/depositMatcher';
import type { ToolHandler, SmartCard } from '../types';

const schema = z.object({
  fileId: z.string().describe('첨부된 은행 거래내역 엑셀의 fileId'),
});

/**
 * 은행 거래내역 엑셀(입금 내역)을 분석해 수강생·강좌·금액과 매칭하고 미리보기 카드를 띄운다.
 * 저장은 하지 않는다 — 사용자가 카드에서 확인 후 [확정]을 눌러야 confirmBankDeposits가 실행된다.
 */
export const analyzeBankDeposits: ToolHandler<typeof schema> = {
  name: 'analyzeBankDeposits',
  description:
    '은행 거래내역 엑셀(입금 내역)을 분석해 각 입금을 수강생·강좌·금액과 매칭한다. ' +
    '입금자명이 "강좌+이름"이면 자동 매칭(auto), "이름만"이거나 동명이인·금액불일치면 확인 후보(needsConfirm)를 제시, ' +
    '그룹입금·코드는 미매칭(unmatched). 결과를 미리보기 카드로 보여주며 저장은 하지 않는다.',
  schema,
  async execute({ fileId }, ctx) {
    if (!ctx.fileStash) throw new Error('첨부 파일을 찾을 수 없습니다.');
    if (!supabase) throw new Error('데이터베이스에 연결할 수 없습니다.');

    const buf = await ctx.fileStash.read(fileId);
    const parsed = parseBankExcel(new Uint8Array(buf));
    if (parsed.deposits.length === 0) {
      return { error: '입금 내역을 찾지 못했습니다. 거래내역 엑셀이 맞는지 확인해주세요.' };
    }

    const [coursesRes, studentsRes, enrollsRes] = await Promise.all([
      supabase.from('courses').select('id, name, fee'),
      supabase.from('students').select('id, name'),
      supabase.from('enrollments').select('id, student_id, course_id'),
    ]);
    if (coursesRes.error) throw new Error(coursesRes.error.message);
    if (studentsRes.error) throw new Error(studentsRes.error.message);
    if (enrollsRes.error) throw new Error(enrollsRes.error.message);

    const matches = matchDeposits(parsed.deposits, {
      courses: (coursesRes.data ?? []).map((c: any) => ({ id: c.id, name: c.name, fee: c.fee ?? 0 })),
      students: (studentsRes.data ?? []).map((s: any) => ({ id: s.id, name: s.name })),
      enrollments: (enrollsRes.data ?? []).map((e: any) => ({
        id: e.id,
        studentId: e.student_id,
        courseId: e.course_id,
      })),
    });

    const items = matches.map(toPreviewItem);

    // 후보로 등장하는 모든 enrollment의 기존 결제 이력을 조회한다.
    // (1) 각 후보에 이력을 주입해 사용자가 "이번 입금이 이미 받은 건지" 직접 비교하게 하고
    // (2) 1순위 후보가 (날짜·금액)까지 겹치면 duplicate로 표시한다.
    const allEnrollmentIds = Array.from(
      new Set(items.flatMap((i) => i.candidates.map((c) => c.enrollmentId))),
    ).filter(Boolean);
    if (allEnrollmentIds.length > 0) {
      const { data: existing } = await supabase
        .from('payment_records')
        .select('enrollment_id, paid_at, amount')
        .in('enrollment_id', allEnrollmentIds);

      const ym = (s: string) => String(s).slice(0, 7); // YYYY-MM
      const byEnrollment = new Map<string, { paidAt: string; amount: number }[]>();
      const existKey = new Set<string>(); // 같은 날·같은 금액 (정확 중복)
      const monthKey = new Set<string>(); // 같은 달·같은 금액 (수동입력 등 날짜만 다른 중복 의심)
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

      for (const it of items) {
        for (const c of it.candidates) {
          const hist = byEnrollment.get(c.enrollmentId);
          if (hist && hist.length > 0) {
            // 최근 날짜 우선 정렬
            c.existingPayments = [...hist].sort((a, b) => (a.paidAt < b.paidAt ? 1 : -1));
          }
        }
        if (!it.enrollmentId) continue;
        const exact = existKey.has(`${it.enrollmentId}|${it.paidAt}|${it.amount}`);
        if (exact) {
          // 같은 날·같은 금액 → 엑셀 재업로드 등, 자동 건너뜀
          it.duplicate = true;
        } else if (
          it.status === 'auto' &&
          monthKey.has(`${it.enrollmentId}|${ym(it.paidAt)}|${it.amount}`)
        ) {
          // 같은 달에 같은 금액 기록이 있음(날짜만 다름) → 자동 저장하지 말고 사용자에게 확인
          it.status = 'needsConfirm';
          it.reason = '같은 달에 같은 금액을 이미 받은 기록이 있어 확인 필요';
        }
      }
    }

    // 위에서 일부 auto가 needsConfirm으로 강등될 수 있으므로 items 기준으로 집계
    const summary = {
      total: items.length,
      auto: items.filter((i) => i.status === 'auto').length,
      needsConfirm: items.filter((i) => i.status === 'needsConfirm').length,
      needsEnrollment: items.filter((i) => i.status === 'needsEnrollment').length,
      needsSplit: items.filter((i) => i.status === 'needsSplit').length,
      unmatched: items.filter((i) => i.status === 'unmatched').length,
      duplicate: items.filter((i) => i.duplicate).length,
      accountName: parsed.accountName,
      period: parsed.period,
    };

    const card: SmartCard = { type: 'bankDepositPreview', fileId, summary, items };
    ctx.emit?.(card);

    // LLM에는 요약 + 확인 필요/미매칭 건 일부만 (전체 items는 카드로 갔으므로 토큰 절약)
    return {
      summary,
      needsConfirmSamples: items
        .filter((i) => i.status === 'needsConfirm')
        .slice(0, 10)
        .map((i) => ({ payer: i.payerName, amount: i.amount, reason: i.reason })),
      unmatchedSamples: items
        .filter((i) => i.status === 'unmatched')
        .slice(0, 10)
        .map((i) => ({ payer: i.payerName, amount: i.amount, reason: i.reason })),
    };
  },
};
