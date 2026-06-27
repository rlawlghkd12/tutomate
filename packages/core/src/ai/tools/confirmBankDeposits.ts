import { z } from 'zod';
import { supabase } from '../../config/supabase';
import { getCurrentQuarter } from '../../utils/quarterUtils';
import { parseBankExcel } from '../bank/parseBankExcel';
import { matchDeposits } from '../bank/depositMatcher';
import type { ToolHandler, SmartCard } from '../types';

const schema = z.object({
  fileId: z.string().describe('analyzeBankDeposits에 넘겼던 동일한 fileId'),
  selections: z
    .array(
      z.object({
        rowIndex: z.number().describe('거래의 원본 행 번호'),
        enrollmentId: z
          .string()
          .optional()
          .describe('사용자가 확인해 고른 기존 수강 등록 id'),
        newEnrollment: z
          .object({
            studentId: z.string(),
            courseId: z.string(),
            quarter: z.string().optional(),
          })
          .optional()
          .describe('등록이 없어 새로 등록하면서 저장할 때 (needsEnrollment 건)'),
        split: z
          .array(z.object({ enrollmentId: z.string(), amount: z.number() }))
          .optional()
          .describe('여러 강의 합산 입금을 등록별로 나눠 저장할 때 (needsSplit 건)'),
        refund: z
          .object({ enrollmentId: z.string(), amount: z.number() })
          .optional()
          .describe('출금을 환불(음수 결제)로 저장할 때 (needsRefund 건). amount는 출금액(양수)'),
      }),
    )
    .default([])
    .describe('needsConfirm/needsEnrollment 건 중 사용자가 확정한 선택. auto 건은 자동 포함됨.'),
});

/** 은행 적요 → payment_records.payment_method enum 매핑 */
function toPaymentMethod(method: string): 'cash' | 'card' | 'transfer' {
  if (method.includes('현금')) return 'cash';
  if (method.includes('카드')) return 'card';
  return 'transfer'; // 인터넷/스마트/이체/EB/텔레뱅킹/ATM 등
}

/**
 * 미리보기에서 확인된 입금들을 payment_records에 저장.
 * - auto 건은 자동 포함, needsConfirm 건은 selections.enrollmentId로 받은 것만 포함
 * - needsEnrollment 건은 selections.newEnrollment로 받으면 등록(enrollment)을 먼저 만든 뒤 저장
 * - 같은 (enrollment_id, paid_at, amount)가 이미 있으면 중복으로 보고 건너뜀(재실행 안전)
 */
export const confirmBankDeposits: ToolHandler<typeof schema> = {
  name: 'confirmBankDeposits',
  description:
    '미리보기에서 확인된 은행 입금/출금을 결제로 저장한다. auto(자동매칭) 입금은 모두 저장하고, ' +
    'needsConfirm 건은 selections로 받은 것만 저장한다. needsEnrollment는 등록을 먼저 만든 뒤 저장하고, ' +
    'needsRefund(출금)는 음수 결제(환불)로 저장한다. 이미 저장된 동일 입금은 건너뛴다. ' +
    '※ 사용자가 미리보기 카드에서 [확정]을 눌렀을 때만 호출해야 한다.',
  schema,
  async execute({ fileId, selections }, ctx) {
    // 사용자가 한 건씩 직접 확인한 입금(selections)은 중복이어도 저장(본인 의도).
    // 자동매칭 건만 기존 결제와 겹치면 안전하게 건너뛴다(엑셀 재업로드 실수 방지).
    if (!ctx.fileStash) throw new Error('첨부 파일을 찾을 수 없습니다.');
    if (!supabase) throw new Error('데이터베이스에 연결할 수 없습니다.');

    const buf = await ctx.fileStash.read(fileId);
    const parsed = parseBankExcel(new Uint8Array(buf));

    const [coursesRes, studentsRes, enrollsRes] = await Promise.all([
      supabase.from('courses').select('id, name, fee'),
      supabase.from('students').select('id, name'),
      supabase.from('enrollments').select('id, student_id, course_id, quarter'),
    ]);
    if (coursesRes.error) throw new Error(coursesRes.error.message);

    const courses = (coursesRes.data ?? []).map((c: any) => ({
      id: c.id,
      name: c.name,
      fee: c.fee ?? 0,
    }));
    const courseFee = new Map(courses.map((c) => [c.id, c.fee]));

    // analyze와 동일하게 현재 분기로 제한 (분기 없는 일반 버전 데이터는 통과)
    const targetQuarter = getCurrentQuarter();
    const matches = matchDeposits(parsed.deposits, {
      courses,
      students: (studentsRes.data ?? []).map((s: any) => ({ id: s.id, name: s.name })),
      enrollments: (enrollsRes.data ?? [])
        .filter((e: any) => !e.quarter || e.quarter === targetQuarter)
        .map((e: any) => ({ id: e.id, studentId: e.student_id, courseId: e.course_id })),
    });

    const selByRow = new Map(selections.map((s) => [s.rowIndex, s]));
    // 입금·출금 모두 rowIndex로 찾을 수 있게 (출금=환불)
    const txByRow = new Map(
      [...parsed.deposits, ...parsed.withdrawals].map((t) => [t.rowIndex, t]),
    );

    // 1) 신규 등록(needsEnrollment) 먼저 생성 → rowIndex별 새 enrollment_id 확보.
    //    수익 관리 페이지가 enrollments.paid_amount를 합산하므로, 입금액을 등록의 납부액으로 반영한다.
    const newEnrollmentIdByRow = new Map<number, string>();
    let enrolled = 0;
    let enrollFailed = 0;
    for (const sel of selections) {
      if (!sel.newEnrollment) continue;
      const tx = txByRow.get(sel.rowIndex);
      if (!tx) continue;
      const fee = courseFee.get(sel.newEnrollment.courseId) ?? 0;
      const amount = tx.amount;
      const remaining = Math.max(0, fee - amount);
      const paymentStatus = amount <= 0 ? 'pending' : amount < fee ? 'partial' : 'completed';
      const { data, error } = await supabase
        .from('enrollments')
        .insert({
          organization_id: ctx.orgId,
          course_id: sel.newEnrollment.courseId,
          student_id: sel.newEnrollment.studentId,
          enrolled_at: new Date().toISOString(),
          payment_status: paymentStatus,
          paid_amount: amount,
          remaining_amount: remaining,
          paid_at: tx.paidAt,
          payment_method: toPaymentMethod(tx.method),
          discount_amount: 0,
          quarter: sel.newEnrollment.quarter ?? null,
        })
        .select('id')
        .single();
      if (error || !data) {
        enrollFailed++;
        continue;
      }
      newEnrollmentIdByRow.set(sel.rowIndex, data.id);
      enrolled++;
    }

    // 2) 저장 후보 구성: auto는 매칭된 enrollment(자동), 선택건은 사용자 확인분
    type Row = {
      organization_id: string;
      enrollment_id: string;
      paid_at: string;
      amount: number;
      payment_method: string;
      notes: string;
      userConfirmed: boolean;
      isRefund?: boolean;
    };
    const candidates: Row[] = [];
    for (const m of matches) {
      const sel = selByRow.get(m.tx.rowIndex);

      // 합산 입금 분할: 한 입금을 여러 등록에 수강료만큼 나눠 저장 (메모에 합산 분할 명시)
      if (sel?.split && sel.split.length > 0) {
        const n = sel.split.length;
        for (const part of sel.split) {
          candidates.push({
            organization_id: ctx.orgId,
            enrollment_id: part.enrollmentId,
            paid_at: m.tx.paidAt,
            amount: part.amount,
            payment_method: toPaymentMethod(m.tx.method),
            notes: `은행입금 합산분할: ${m.tx.payerName} — 총 ${m.tx.amount}원을 ${n}개 강의로 나눔 (${m.tx.method || '경로미상'})`,
            userConfirmed: true,
          });
        }
        continue;
      }

      let enrollmentId: string | undefined;
      let userConfirmed = false;
      if (sel?.newEnrollment) {
        enrollmentId = newEnrollmentIdByRow.get(m.tx.rowIndex);
        userConfirmed = true;
      } else if (sel?.enrollmentId) {
        enrollmentId = sel.enrollmentId;
        userConfirmed = true;
      } else if (m.status === 'auto') {
        enrollmentId = m.candidates.find(
          (c) => c.studentId === m.studentId && c.courseId === m.courseId,
        )?.enrollmentId;
      }
      if (!enrollmentId) continue;
      candidates.push({
        organization_id: ctx.orgId,
        enrollment_id: enrollmentId,
        paid_at: m.tx.paidAt,
        amount: m.tx.amount,
        payment_method: toPaymentMethod(m.tx.method),
        notes: `은행입금 자동기록: ${m.tx.payerName} (${m.tx.method || '경로미상'})`,
        userConfirmed,
      });
    }

    // 3) 환불(출금): 사용자가 확인한 출금을 음수 결제로 저장
    for (const sel of selections) {
      if (!sel.refund) continue;
      const tx = txByRow.get(sel.rowIndex);
      if (!tx) continue;
      candidates.push({
        organization_id: ctx.orgId,
        enrollment_id: sel.refund.enrollmentId,
        paid_at: tx.paidAt,
        amount: -Math.abs(sel.refund.amount),
        payment_method: toPaymentMethod(tx.method),
        notes: `은행출금 환불: ${tx.payerName} (${tx.method || '경로미상'})`,
        userConfirmed: true,
        isRefund: true,
      });
    }

    if (candidates.length === 0) {
      const card: SmartCard = {
        type: 'bankDepositResult',
        saved: 0,
        skipped: 0,
        failed: enrollFailed,
        enrolled,
        refunded: 0,
      };
      ctx.emit?.(card);
      return { saved: 0, skipped: 0, failed: enrollFailed, enrolled, refunded: 0, message: '저장할 입금 건이 없습니다.' };
    }

    // 중복 방지 — 동일 (enrollment_id, paid_at, amount) 기존 레코드 제외
    const enrollmentIds = Array.from(new Set(candidates.map((c) => c.enrollment_id)));
    const { data: existing } = await supabase
      .from('payment_records')
      .select('enrollment_id, paid_at, amount')
      .in('enrollment_id', enrollmentIds);
    const ym = (s: string) => String(s).slice(0, 7); // YYYY-MM
    const existKey = new Set(
      (existing ?? []).map((e: any) => `${e.enrollment_id}|${e.paid_at}|${e.amount}`),
    );
    const monthKey = new Set(
      (existing ?? []).map((e: any) => `${e.enrollment_id}|${ym(e.paid_at)}|${e.amount}`),
    );

    // 사용자가 직접 확인한 건은 항상 저장.
    // 자동매칭 건은 같은 날뿐 아니라 같은 달·같은 금액 기록이 있으면(수동입력 등) 자동 저장 제외.
    const toInsert = candidates.filter((c) => {
      if (c.userConfirmed) return true;
      const exact = existKey.has(`${c.enrollment_id}|${c.paid_at}|${c.amount}`);
      const month = monthKey.has(`${c.enrollment_id}|${ym(c.paid_at)}|${c.amount}`);
      return !exact && !month;
    });
    const skipped = candidates.length - toInsert.length;

    // payment_records에 없는 내부 플래그(userConfirmed/isRefund) 제거 후 insert
    const insertRows = toInsert.map(({ userConfirmed: _u, isRefund: _r, ...row }) => row);

    let saved = 0;
    let refunded = 0;
    let failed = enrollFailed;
    if (insertRows.length > 0) {
      const { data, error } = await supabase.from('payment_records').insert(insertRows).select('id');
      if (error) {
        failed += toInsert.length;
      } else {
        const total = data?.length ?? 0;
        refunded = toInsert.filter((r) => r.isRefund).length;
        saved = Math.max(0, total - refunded); // 입금 저장 건수 (환불 제외)
      }
    }

    const card: SmartCard = { type: 'bankDepositResult', saved, skipped, failed, enrolled, refunded };
    ctx.emit?.(card);
    return { saved, skipped, failed, enrolled, refunded };
  },
};
