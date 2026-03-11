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
 * 로컬 데이터 원본을 JSON 객체로 반환 (DB 백업용)
 */
export async function getLocalDataSnapshot(): Promise<Record<string, unknown[]> | null> {
  if (!isTauri()) return null;
  try {
    const courses = await loadFromTauri('courses');
    const students = await loadFromTauri('students');
    const enrollments = await loadFromTauri('enrollments');
    const monthly_payments = await loadFromTauri('monthly_payments');
    const total = courses.length + students.length + enrollments.length + monthly_payments.length;
    if (total === 0) return null;
    return { courses, students, enrollments, monthly_payments };
  } catch {
    return null;
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
 * 로컬 백업 ZIP에서 monthly_payments 데이터만 추출하여 Supabase에 복원
 * Supabase에 monthly_payments가 0건이고, 백업에 데이터가 있을 때만 실행
 */
export async function restoreMonthlyPaymentsFromBackup(orgId: string): Promise<boolean> {
  if (!isTauri() || !supabase) return false;

  try {
    // 1. Supabase에 monthly_payments가 이미 있으면 스킵
    const { count } = await supabase
      .from('monthly_payments')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', orgId);

    if ((count ?? 0) > 0) {
      logInfo('monthly_payments already has data, skipping backup restore');
      return false;
    }

    // 2. 가장 최신 백업 ZIP 찾기
    const { invoke } = await import('@tauri-apps/api/core');
    const backups = await invoke<Array<{ filename: string; created_at: string }>>('list_backups');

    if (!backups || backups.length === 0) {
      logInfo('No backup files found for monthly_payments restore');
      return false;
    }

    // 최신 백업 순 정렬
    backups.sort((a, b) => b.created_at.localeCompare(a.created_at));

    // 3. 백업에서 로컬로 복원 → monthly_payments.json 로드
    for (const backup of backups) {
      try {
        await invoke('restore_backup', { filename: backup.filename });
        const payments = await loadFromTauri<MonthlyPayment>('monthly_payments');

        if (payments.length > 0) {
          logInfo('Found monthly_payments in backup', { data: { filename: backup.filename, count: payments.length } });

          // 4. enrollment_id 매핑: 백업의 enrollment_id가 현재 Supabase에 존재하는지 확인
          const { data: existingEnrollments } = await supabase
            .from('enrollments')
            .select('id')
            .eq('organization_id', orgId);

          const validEnrollmentIds = new Set((existingEnrollments || []).map(e => e.id));

          const validPayments = payments.filter(mp => validEnrollmentIds.has(mp.enrollmentId));

          if (validPayments.length > 0) {
            const rows = validPayments.map((mp) =>
              mapMonthlyPaymentToDb(mp, orgId),
            );
            await supabaseBulkInsert('monthly_payments', rows);
            logInfo('monthly_payments restored from backup', { data: { count: validPayments.length } });

            // 로컬 파일 정리
            await invoke('save_data', { key: 'monthly_payments', data: '[]' });
            return true;
          }
        }
      } catch (err) {
        logWarn(`Failed to read backup ${backup.filename}: ${err}`);
        continue;
      }
    }

    // 로컬 파일 정리
    try {
      await invoke('save_data', { key: 'monthly_payments', data: '[]' });
    } catch { /* ignore */ }

    logInfo('No monthly_payments data found in any backup');
    return false;
  } catch (err) {
    logError('restoreMonthlyPaymentsFromBackup failed', { error: err });
    return false;
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
