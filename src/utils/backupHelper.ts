/**
 * 클라우드(Supabase) 기반 백업/복원 유틸리티
 *
 * 백업 생성: Supabase → camelCase JSON → Electron 로컬 파일 → ZIP
 * 백업 복원: ZIP → Electron 로컬 파일 → Supabase 직접 업로드
 */
import { supabase } from '../config/supabase';
import { supabaseLoadData, supabaseBulkInsert } from './supabaseStorage';
import { isElectron } from './tauri';
import { logInfo, logError } from './logger';
import {
  mapCourseFromDb,
  mapStudentFromDb,
  mapEnrollmentFromDb,
  mapMonthlyPaymentFromDb,
  mapCourseToDb,
  mapStudentToDb,
  mapEnrollmentToDb,
  mapMonthlyPaymentToDb,
  type CourseRow,
  type StudentRow,
  type EnrollmentRow,
  type MonthlyPaymentRow,
} from './fieldMapper';
import type { Course, Student, Enrollment, MonthlyPayment } from '../types';

/**
 * Supabase 데이터를 Electron 로컬 파일에 덤프 (백업 ZIP 생성 전 단계)
 */
export async function dumpSupabaseToLocal(): Promise<void> {
  if (!isElectron() || !supabase) return;

  const [courseRows, studentRows, enrollmentRows, paymentRows] = await Promise.all([
    supabaseLoadData<CourseRow>('courses'),
    supabaseLoadData<StudentRow>('students'),
    supabaseLoadData<EnrollmentRow>('enrollments'),
    supabaseLoadData<MonthlyPaymentRow>('monthly_payments'),
  ]);

  const courses = courseRows.map(mapCourseFromDb);
  const students = studentRows.map(mapStudentFromDb);
  const enrollments = enrollmentRows.map(mapEnrollmentFromDb);
  const monthlyPayments = paymentRows.map(mapMonthlyPaymentFromDb);

  await Promise.all([
    window.electronAPI.saveData('courses', JSON.stringify(courses)),
    window.electronAPI.saveData('students', JSON.stringify(students)),
    window.electronAPI.saveData('enrollments', JSON.stringify(enrollments)),
    window.electronAPI.saveData('monthly_payments', JSON.stringify(monthlyPayments)),
  ]);

  logInfo('Dumped Supabase data to local files', {
    data: {
      courses: courses.length,
      students: students.length,
      enrollments: enrollments.length,
      monthlyPayments: monthlyPayments.length,
    },
  });
}

/**
 * 로컬 파일 클리어 (임시 데이터 정리)
 */
async function clearLocalFiles(): Promise<void> {
  if (!isElectron()) return;
  const keys = ['courses', 'students', 'enrollments', 'monthly_payments'];
  await Promise.all(keys.map((key) => window.electronAPI.saveData(key, '[]').catch(() => {})));
}

/**
 * 클라우드 데이터 기준으로 백업 ZIP 생성
 */
export async function createCloudBackup(orgName?: string): Promise<void> {
  if (!isElectron()) return;

  await dumpSupabaseToLocal();
  await window.electronAPI.createBackup(orgName || undefined);
  logInfo('Cloud backup created');
  await clearLocalFiles();
}

/**
 * 백업 ZIP에서 Supabase로 복원
 *
 * 1. (옵션) 안전 백업 — 현재 Supabase 데이터를 먼저 백업
 * 2. restoreBackup으로 ZIP → 로컬 파일 추출
 * 3. 로컬 파일 읽어서 Supabase에 직접 업로드
 * 4. 로컬 파일 클리어
 */
export async function restoreCloudBackup(
  filename: string,
  orgId: string,
  safetyBackup = true,
): Promise<{ success: boolean; error?: string }> {
  if (!isElectron()) return { success: false, error: 'Electron 환경이 아닙니다' };

  try {
    // 1. 안전 백업
    if (safetyBackup) {
      try {
        await createCloudBackup();
        logInfo('Safety backup created before restore');
      } catch (err) {
        logError('Safety backup failed, continuing restore', { error: err });
      }
    }

    // 2. ZIP → 로컬 파일 추출
    await window.electronAPI.restoreBackup(filename);
    logInfo('Backup files extracted to local');

    // 3. 로컬 파일 읽기
    const [coursesRaw, studentsRaw, enrollmentsRaw, paymentsRaw] = await Promise.all([
      window.electronAPI.loadData('courses'),
      window.electronAPI.loadData('students'),
      window.electronAPI.loadData('enrollments'),
      window.electronAPI.loadData('monthly_payments'),
    ]);

    const courses: Course[] = coursesRaw ? JSON.parse(coursesRaw) : [];
    const students: Student[] = studentsRaw ? JSON.parse(studentsRaw) : [];
    const enrollments: Enrollment[] = enrollmentsRaw ? JSON.parse(enrollmentsRaw) : [];
    const monthlyPayments: MonthlyPayment[] = paymentsRaw ? JSON.parse(paymentsRaw) : [];

    // 기존 데이터 삭제 (FK 역순)
    if (supabase) {
      for (const table of ['monthly_payments', 'enrollments', 'students', 'courses'] as const) {
        await supabase.from(table).delete().eq('organization_id', orgId);
      }
    }

    // ID 리매핑 + Supabase 업로드
    const courseIdMap = new Map<string, string>();
    const studentIdMap = new Map<string, string>();
    const enrollmentIdMap = new Map<string, string>();

    if (courses.length > 0) {
      const rows = courses.map((c) => {
        const newId = crypto.randomUUID();
        courseIdMap.set(c.id, newId);
        return mapCourseToDb({ ...c, id: newId }, orgId);
      });
      await supabaseBulkInsert('courses', rows);
    }

    if (students.length > 0) {
      const rows = students.map((s) => {
        const newId = crypto.randomUUID();
        studentIdMap.set(s.id, newId);
        return mapStudentToDb({ ...s, id: newId }, orgId);
      });
      await supabaseBulkInsert('students', rows);
    }

    if (enrollments.length > 0) {
      const rows = enrollments.map((e) => {
        const newId = crypto.randomUUID();
        enrollmentIdMap.set(e.id, newId);
        return mapEnrollmentToDb({
          ...e,
          id: newId,
          courseId: courseIdMap.get(e.courseId) || e.courseId,
          studentId: studentIdMap.get(e.studentId) || e.studentId,
        }, orgId);
      });
      await supabaseBulkInsert('enrollments', rows);
    }

    if (monthlyPayments.length > 0) {
      const rows = monthlyPayments.map((mp) => {
        const newId = crypto.randomUUID();
        return mapMonthlyPaymentToDb({
          ...mp,
          id: newId,
          enrollmentId: enrollmentIdMap.get(mp.enrollmentId) || mp.enrollmentId,
        }, orgId);
      });
      await supabaseBulkInsert('monthly_payments', rows);
    }

    logInfo('Backup data uploaded to Supabase', {
      data: { courses: courses.length, students: students.length, enrollments: enrollments.length, monthlyPayments: monthlyPayments.length },
    });

    // 4. 로컬 파일 클리어
    await clearLocalFiles();

    return { success: true };
  } catch (err) {
    logError('Restore cloud backup failed', { error: err });
    return { success: false, error: String(err) };
  }
}
