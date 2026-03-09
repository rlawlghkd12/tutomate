/**
 * 클라우드(Supabase) 기반 백업/복원 유틸리티
 *
 * 백업 생성: Supabase → camelCase JSON → Electron 로컬 파일 → ZIP
 * 백업 복원: ZIP → Electron 로컬 파일 → migrateLocalToCloud → Supabase
 */
import { supabase } from '../config/supabase';
import { supabaseLoadData } from './supabaseStorage';
import { migrateLocalToCloud, clearLocalData } from './migrationHelper';
import { isElectron } from './tauri';
import { logInfo, logError } from './logger';
import {
  mapCourseFromDb,
  mapStudentFromDb,
  mapEnrollmentFromDb,
  mapMonthlyPaymentFromDb,
  type CourseRow,
  type StudentRow,
  type EnrollmentRow,
  type MonthlyPaymentRow,
} from './fieldMapper';

/**
 * Supabase 데이터를 Electron 로컬 파일에 덤프 (백업 ZIP 생성 전 단계)
 */
export async function dumpSupabaseToLocal(): Promise<void> {
  if (!isElectron() || !supabase) return;

  // Supabase에서 4개 테이블 로드 → fromDb 매퍼로 camelCase 변환
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

  // 로컬 파일에 저장
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
 * 클라우드 데이터 기준으로 백업 ZIP 생성
 *
 * 1. Supabase → 로컬 파일 덤프
 * 2. Electron createBackup으로 ZIP 생성
 * 3. 로컬 파일 클리어 (임시 데이터 정리)
 */
export async function createCloudBackup(orgName?: string): Promise<void> {
  if (!isElectron()) return;

  // 1. Supabase 데이터를 로컬 파일에 덤프
  await dumpSupabaseToLocal();

  // 2. ZIP 생성
  await window.electronAPI.createBackup(orgName || undefined);
  logInfo('Cloud backup created');

  // 3. 임시 로컬 파일 클리어
  await clearLocalData();
}

/**
 * 백업 ZIP에서 Supabase로 복원
 *
 * 1. (옵션) 안전 백업 — 현재 Supabase 데이터를 먼저 백업
 * 2. restoreBackup으로 ZIP → 로컬 파일 추출
 * 3. migrateLocalToCloud로 로컬 → Supabase 업로드
 * 4. 로컬 파일 클리어
 *
 * @param filename 백업 ZIP 파일명
 * @param orgId 대상 organization_id
 * @param safetyBackup true이면 복원 전 현재 데이터 안전 백업 생성
 */
export async function restoreCloudBackup(
  filename: string,
  orgId: string,
  safetyBackup = true,
): Promise<{ success: boolean; error?: string }> {
  if (!isElectron()) return { success: false, error: 'Electron 환경이 아닙니다' };

  try {
    // 1. 안전 백업 (현재 Supabase 데이터 기준)
    if (safetyBackup) {
      try {
        await createCloudBackup();
        logInfo('Safety backup created before restore');
      } catch (err) {
        logError('Safety backup failed, continuing restore', { error: err });
        // 안전 백업 실패해도 복원은 계속 진행
      }
    }

    // 2. ZIP → 로컬 파일 추출
    await window.electronAPI.restoreBackup(filename);
    logInfo('Backup files extracted to local');

    // 3. 로컬 파일 → Supabase 업로드 (마이그레이션 재사용)
    const result = await migrateLocalToCloud(orgId);
    if (!result.success) {
      return { success: false, error: '데이터 업로드에 실패했습니다' };
    }
    logInfo('Backup data uploaded to Supabase', { data: result.counts });

    // 4. 로컬 파일 클리어
    await clearLocalData();

    return { success: true };
  } catch (err) {
    logError('Restore cloud backup failed', { error: err });
    return { success: false, error: String(err) };
  }
}
