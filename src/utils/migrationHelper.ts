/**
 * 로컬 파일시스템(Tauri) 데이터 → Supabase 클라우드 마이그레이션 헬퍼
 *
 * 프로덕션 환경에서는 Tauri 파일시스템({key}.json)에만 데이터가 존재.
 * 비-Tauri(브라우저) 환경은 항상 Supabase를 직접 사용하므로 마이그레이션 불필요.
 */
import type { Course, Student, Enrollment, MonthlyPayment } from '../types';
import { supabaseBulkInsert } from './supabaseStorage';
import {
  mapCourseToDb,
  mapStudentToDb,
  mapEnrollmentToDb,
  mapMonthlyPaymentToDb,
} from './fieldMapper';
import { logInfo, logError, logWarn } from './logger';
import { isTauri } from './tauri';
import { supabase } from '../config/supabase';

interface MigrationResult {
  success: boolean;
  counts: {
    courses: number;
    students: number;
    enrollments: number;
    monthlyPayments: number;
  };
}

/**
 * Tauri 파일시스템에서 JSON 배열 로드
 * Tauri 환경이 아니면 빈 배열 반환
 */
async function loadFromTauri<T>(key: string): Promise<T[]> {
  if (!isTauri()) return [];
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const raw = await invoke<string>('load_data', { key });
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.length > 0) return arr;
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Tauri 파일시스템에 레거시 로컬 데이터가 있는지 확인
 * courses 또는 students 파일에 데이터가 1건 이상이면 true
 */
export async function hasLocalData(): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    const courses = await loadFromTauri<Course>('courses');
    if (courses.length > 0) return true;
    const students = await loadFromTauri<Student>('students');
    return students.length > 0;
  } catch {
    return false;
  }
}

/**
 * Tauri 파일시스템의 로컬 데이터를 Supabase로 마이그레이션
 *
 * @param orgId 대상 organization_id
 * @param onProgress 진행률 콜백 (0-100)
 */
export async function migrateLocalToCloud(
  orgId: string,
  onProgress?: (percent: number) => void,
): Promise<MigrationResult> {
  const courses = await loadFromTauri<Course>('courses');
  const students = await loadFromTauri<Student>('students');
  const enrollments = await loadFromTauri<Enrollment>('enrollments');
  const monthlyPayments = await loadFromTauri<MonthlyPayment>('monthly_payments');

  const totalSteps = 4;
  let step = 0;
  const report = (s: number) => onProgress?.(Math.round((s / totalSteps) * 100));

  // ID 매핑 (PK 충돌 방지)
  const courseIdMap = new Map<string, string>();
  const studentIdMap = new Map<string, string>();
  const enrollmentIdMap = new Map<string, string>();

  try {
    // 부분 실패 재시도 대비: 해당 org의 기존 데이터를 역순으로 삭제 (FK 순서)
    if (supabase) {
      const tables = ['monthly_payments', 'enrollments', 'students', 'courses'] as const;
      for (const table of tables) {
        const { error } = await supabase.from(table).delete().eq('organization_id', orgId);
        if (error) {
          logError(`Pre-migration cleanup failed for ${table}: ${error.message}`, { error });
          throw new Error(`Cleanup failed: ${table}`);
        }
      }
    }

    // 1. 강좌
    if (courses.length > 0) {
      const rows = courses.map((c) => {
        const newId = crypto.randomUUID();
        courseIdMap.set(c.id, newId);
        return mapCourseToDb({ ...c, id: newId }, orgId);
      });
      await supabaseBulkInsert('courses', rows);
      logInfo('Migration: courses uploaded', { data: { count: courses.length } });
    }
    step++;
    report(step);

    // 2. 수강생
    if (students.length > 0) {
      const rows = students.map((s) => {
        const newId = crypto.randomUUID();
        studentIdMap.set(s.id, newId);
        return mapStudentToDb({ ...s, id: newId }, orgId);
      });
      await supabaseBulkInsert('students', rows);
      logInfo('Migration: students uploaded', { data: { count: students.length } });
    }
    step++;
    report(step);

    // 3. 수강 등록 (FK 리매핑)
    if (enrollments.length > 0) {
      const rows = enrollments.map((e) => {
        const newId = crypto.randomUUID();
        enrollmentIdMap.set(e.id, newId);
        return mapEnrollmentToDb(
          {
            ...e,
            id: newId,
            courseId: courseIdMap.get(e.courseId) || e.courseId,
            studentId: studentIdMap.get(e.studentId) || e.studentId,
          },
          orgId,
        );
      });
      await supabaseBulkInsert('enrollments', rows);
      logInfo('Migration: enrollments uploaded', { data: { count: enrollments.length } });
    }
    step++;
    report(step);

    // 4. 월별 결제 (FK 리매핑)
    if (monthlyPayments.length > 0) {
      const rows = monthlyPayments.map((mp) => {
        const newId = crypto.randomUUID();
        return mapMonthlyPaymentToDb(
          {
            ...mp,
            id: newId,
            enrollmentId: enrollmentIdMap.get(mp.enrollmentId) || mp.enrollmentId,
          },
          orgId,
        );
      });
      await supabaseBulkInsert('monthly_payments', rows);
      logInfo('Migration: monthly_payments uploaded', { data: { count: monthlyPayments.length } });
    }
    step++;
    report(step);

    return {
      success: true,
      counts: {
        courses: courses.length,
        students: students.length,
        enrollments: enrollments.length,
        monthlyPayments: monthlyPayments.length,
      },
    };
  } catch (error) {
    logError('Migration failed', { error });
    return {
      success: false,
      counts: {
        courses: courses.length,
        students: students.length,
        enrollments: enrollments.length,
        monthlyPayments: monthlyPayments.length,
      },
    };
  }
}

/**
 * 마이그레이션 완료 후 Tauri 파일시스템의 로컬 데이터 클리어
 * 파일 삭제 대신 빈 배열([])로 덮어쓰기 — 더 안전
 */
export async function clearLocalData(): Promise<void> {
  if (!isTauri()) return;

  const keys = ['courses', 'students', 'enrollments', 'monthly_payments'];

  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await Promise.all(
      keys.map((key) =>
        invoke('save_data', { key, data: '[]' }).catch((err) =>
          logWarn(`Failed to clear Tauri file for "${key}": ${err}`),
        ),
      ),
    );
  } catch (err) {
    logWarn(`Tauri import failed during clearLocalData: ${err}`);
  }

  logInfo('Local data cleared after migration');
}
