/**
 * 결제 임포트 매칭용 lookup(학생·강좌·등록·기존결제)을 Supabase에서 조립.
 * previewImport(미리보기)와 confirmImport(비선택 확정)가 공유해 매칭 결과를 일치시킨다.
 *
 * 이름 폴백(FR-2): 조직 전체 학생을 가져와 메모리에서 정규화 매칭(공백·표기 변형 무시).
 * enrollments·기존결제는 매칭된 학생만 조회해 범위를 좁힌다. 은행 흐름과 동일 패턴.
 */
import { supabase } from '../../config/supabase';
import { norm } from '../matching/normalize';
import type { PreviewLookup, PreviewRowInput } from './buildPreview';
import type { DedupPayment } from '../dedup/DedupChecker';

const digitsOnly = (s?: string) => (s ?? '').replace(/\D/g, '');

/** rows의 이름/전화와 매칭되는 학생 범위로 lookup을 만든다. 매칭 학생이 없으면 null. */
export async function buildPaymentLookup(rows: PreviewRowInput[]): Promise<PreviewLookup | null> {
  if (!supabase) return null;
  const db = supabase;

  const rowPhones = new Set(rows.map((r) => digitsOnly(r.phone)).filter(Boolean));
  const rowNames = new Set(rows.map((r) => norm(r.name)).filter(Boolean));

  const { data: allStudents } = await db.from('students').select('id, name, phone');
  const students = (allStudents ?? [])
    .filter(
      (s: any) =>
        (s.phone && rowPhones.has(digitsOnly(s.phone))) || (s.name && rowNames.has(norm(s.name))),
    )
    .map((s: any) => ({ id: s.id as string, name: s.name as string, phone: s.phone as string | undefined }));
  const studentIds = students.map((s) => s.id);
  if (studentIds.length === 0) return null;

  const { data: enrolls } = await db
    .from('enrollments')
    .select('id, student_id, course_id, discount_amount, quarter, courses(name, fee)')
    .in('student_id', studentIds);

  const courses: { id: string; name: string; fee: number }[] = [];
  const seenCourse = new Set<string>();
  const effectiveFeeByEnrollment = new Map<string, number>();
  for (const e of enrolls ?? []) {
    const cid = (e as any).course_id;
    const cname = (e as any).courses?.name ?? '';
    const fee = Number((e as any).courses?.fee ?? 0);
    const discount = Number((e as any).discount_amount ?? 0);
    effectiveFeeByEnrollment.set((e as any).id, Math.max(0, fee - discount));
    if (cid && !seenCourse.has(cid)) {
      seenCourse.add(cid);
      courses.push({ id: cid, name: cname, fee });
    }
  }

  const enrollmentIds = (enrolls ?? []).map((e: any) => e.id);
  const existingByEnrollment = new Map<string, DedupPayment[]>();
  if (enrollmentIds.length > 0) {
    const { data: pays } = await db
      .from('payment_records')
      .select('enrollment_id, paid_at, amount')
      .in('enrollment_id', enrollmentIds);
    for (const p of pays ?? []) {
      const eid = (p as any).enrollment_id;
      const list = existingByEnrollment.get(eid) ?? [];
      list.push({ paidAt: (p as any).paid_at, amount: Number((p as any).amount) });
      existingByEnrollment.set(eid, list);
    }
  }

  return {
    students,
    courses,
    enrollments: (enrolls ?? []).map((e: any) => ({
      id: e.id,
      studentId: e.student_id,
      courseId: e.course_id,
      quarter: e.quarter ?? undefined,
      fee: effectiveFeeByEnrollment.get(e.id), // 실효 수강료(할인 반영) — 금액 매칭 정확도
    })),
    effectiveFeeByEnrollment,
    existingByEnrollment,
  };
}
