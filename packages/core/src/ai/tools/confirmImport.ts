import { z } from 'zod';
import { parseExcel } from '../../excel/ExcelParser';
import { normalizeRow } from '../../excel/DataNormalizer';
import { supabase } from '../../config/supabase';
import type { ToolHandler, SmartCard } from '../types';
import type { StandardField } from '../../excel/types';

const schema = z.object({
  fileId: z.string(),
  mapping: z.record(z.string(), z.string()),
  kind: z.enum(['students', 'payments']),
});

export const confirmImport: ToolHandler<typeof schema> = {
  name: 'confirmImport',
  description: '미리보기 확정. Supabase에 학생/결제 일괄 UPSERT.',
  schema,
  async execute({ fileId, mapping, kind }, ctx) {
    if (!ctx.fileStash) throw new Error('FileStash 비활성');
    if (!supabase) throw new Error('Supabase 미설정');
    // students·payment_records는 organization_id가 NOT NULL이고 RLS(insert)가
    // organization_id = get_user_org_id() 를 요구한다. 이 값이 없으면 저장이 통째로 실패한다.
    if (!ctx.orgId) throw new Error('현재 조직을 확인할 수 없어 저장할 수 없습니다. 다시 로그인해 주세요.');
    const buf = await ctx.fileStash.read(fileId);
    const parsed = parseExcel(new Uint8Array(buf));
    const typed = mapping as Record<string, StandardField>;

    const normalized = parsed.rows.map((r) => normalizeRow(r, typed));
    const valid = normalized.filter((n) => n.errors.length === 0);
    const errors = normalized.length - valid.length;

    let added = 0;
    let duplicated = 0;

    if (kind === 'students') {
      const rows = valid
        .map((n) => ({
          name: n.data.name as string,
          phone: (n.data.phone as string | undefined) || null,
          birth_date: (n.data.birthDate as string | undefined) || null,
        }))
        .filter((r) => r.name);

      // students.phone엔 unique 제약이 없어 upsert(onConflict:'phone')가 불가능하다.
      // 조직 내 기존 전화번호를 조회해 새 학생만 insert하고, 이미 있는 번호는 중복으로 건너뛴다.
      // (select는 RLS로 현재 조직 범위로 자동 스코프됨)
      const phones = rows.map((r) => r.phone).filter(Boolean) as string[];
      const existing = new Set<string>();
      if (phones.length > 0) {
        const { data: dup, error: dupErr } = await supabase
          .from('students')
          .select('phone')
          .in('phone', phones);
        if (dupErr) throw new Error(dupErr.message);
        for (const d of dup ?? []) {
          const p = (d as { phone?: string }).phone;
          if (p) existing.add(p);
        }
      }
      const toInsert = rows
        .filter((r) => !(r.phone && existing.has(r.phone)))
        .map((r) => ({ ...r, organization_id: ctx.orgId }));
      duplicated = rows.length - toInsert.length;

      if (toInsert.length > 0) {
        const { data, error } = await supabase
          .from('students')
          .insert(toInsert)
          .select('id');
        if (error) throw new Error(error.message);
        added = data?.length ?? 0;
      }
    } else {
      // payments: phone → student → enrollment(들 중 하나) → payment_records.enrollment_id
      // 학생이 여러 강좌면 className 매핑이 필요. 일단 className 기반 매칭 시도.
      const phones = Array.from(
        new Set(valid.map((n) => n.data.phone).filter(Boolean)),
      ) as string[];

      const { data: students } = await supabase
        .from('students').select('id, phone').in('phone', phones);
      const phoneToStudent = new Map((students ?? []).map((s: any) => [s.phone, s.id]));

      // 모든 enrollments 한 번에 가져와서 in-memory 매칭
      const studentIds = (students ?? []).map((s: any) => s.id);
      const { data: enrolls } = await supabase
        .from('enrollments')
        .select('id, student_id, course_id, courses(name)')
        .in('student_id', studentIds);

      const enrollByStudentCourse = new Map<string, string>(); // `${studentId}|${className}` → enrollment_id
      const enrollByStudentSole = new Map<string, string>();   // studentId → enrollment_id (단일 등록 시)
      const studentEnrollCount = new Map<string, number>();
      for (const e of enrolls ?? []) {
        const sid = (e as any).student_id;
        const cname = (e as any).courses?.name;
        if (cname) enrollByStudentCourse.set(`${sid}|${cname}`, (e as any).id);
        studentEnrollCount.set(sid, (studentEnrollCount.get(sid) ?? 0) + 1);
        enrollByStudentSole.set(sid, (e as any).id);
      }

      const rows: any[] = [];
      for (const n of valid) {
        const phone = n.data.phone as string | undefined;
        if (!phone) { duplicated++; continue; }
        const sid = phoneToStudent.get(phone);
        if (!sid) { duplicated++; continue; }

        let enrollmentId: string | undefined;
        const className = n.data.className as string | undefined;
        if (className) {
          enrollmentId = enrollByStudentCourse.get(`${sid}|${className}`);
        }
        // className 없거나 매칭 실패 → 등록이 1개면 자동, 여러 개면 스킵
        if (!enrollmentId) {
          const count = studentEnrollCount.get(sid) ?? 0;
          if (count === 1) enrollmentId = enrollByStudentSole.get(sid);
        }
        if (!enrollmentId) { duplicated++; continue; }

        rows.push({
          organization_id: ctx.orgId,
          enrollment_id: enrollmentId,
          paid_at: n.data.paymentDate,
          amount: n.data.amount,
          payment_method: n.data.paymentMethod ?? 'cash',
        });
      }

      if (rows.length > 0) {
        const { data, error } = await supabase
          .from('payment_records').insert(rows).select('id');
        if (error) throw new Error(error.message);
        added = data?.length ?? 0;
      }
    }

    const card: SmartCard = { type: 'importResult', added, duplicated, errors };
    ctx.emit?.(card);
    return { status: 'done', added, duplicated, errors };
  },
};
