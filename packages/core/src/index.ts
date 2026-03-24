// ─── Config ──────────────────────────────────────────────────────
export { appConfig } from './config/appConfig';
export { APP_NAME, useAppVersion } from './config/version';
export { supabase, isSupabaseConfigured } from './config/supabase';
export { PLAN_LIMITS } from './config/planLimits';
export type { PlanType, PlanLimitKey } from './config/planLimits';
export {
  FLEX_CENTER,
  FLEX_BETWEEN,
  EXEMPT_COLOR,
  useChartColors,
  useChartTooltipStyle,
} from './config/styles';
export type { ChartColors, ChartTooltipStyle } from './config/styles';

// ─── Stores ──────────────────────────────────────────────────────
export { useSettingsStore } from './stores/settingsStore';
export type { FontSize, Theme } from './stores/settingsStore';
export { useAuthStore, isCloud, getOrgId, getPlan } from './stores/authStore';
export { useCourseStore } from './stores/courseStore';
export { useStudentStore } from './stores/studentStore';
export { useEnrollmentStore } from './stores/enrollmentStore';
export { useMonthlyPaymentStore } from './stores/monthlyPaymentStore';
export { useLicenseStore } from './stores/licenseStore';
export type { ActivateResult } from './stores/licenseStore';
export { useLockStore } from './stores/lockStore';
export { useNotificationStore } from './stores/notificationStore';

// ─── Utils ───────────────────────────────────────────────────────
export {
  dumpSupabaseToLocal,
  createCloudBackup,
  restoreCloudBackup,
} from './utils/backupHelper';

export { createDataHelper } from './utils/dataHelper';
export type { DataHelper } from './utils/dataHelper';

export { default as dayjs } from './utils/dayjs';

export {
  ErrorType,
  AppError,
  ErrorHandler,
  errorHandler,
  handleError,
  createError,
} from './utils/errors';
export type { AppErrorOptions } from './utils/errors';

export {
  exportStudentsToExcel,
  exportStudentsToCSV,
  exportRevenueToExcel,
  exportRevenueToCSV,
  exportCourseStudentsToExcel,
  exportCourseStudentsToCSV,
  STUDENT_EXPORT_FIELDS,
  REVENUE_EXPORT_FIELDS,
  COURSE_STUDENT_EXPORT_FIELDS,
} from './utils/export';
export type {
  StudentExportField,
  RevenueExportField,
  CourseStudentExportField,
} from './utils/export';

export {
  mapCourseFromDb,
  mapCourseToDb,
  mapCourseUpdateToDb,
  mapStudentFromDb,
  mapStudentToDb,
  mapStudentUpdateToDb,
  mapEnrollmentFromDb,
  mapEnrollmentToDb,
  mapEnrollmentUpdateToDb,
  mapMonthlyPaymentFromDb,
  mapMonthlyPaymentToDb,
  mapMonthlyPaymentUpdateToDb,
} from './utils/fieldMapper';
export type {
  CourseRow,
  StudentRow,
  EnrollmentRow,
  MonthlyPaymentRow,
} from './utils/fieldMapper';

export { formatPhone, parseBirthDate } from './utils/formatters';

export {
  LogLevel,
  logger,
  logDebug,
  logInfo,
  logWarn,
  logError,
} from './utils/logger';

export {
  generatePaymentOverdueNotifications,
  generatePaymentReminderNotifications,
  generateAllNotifications,
} from './utils/notificationGenerator';

export {
  generateClassDates,
  getNextClassDate,
  hasTodayClass,
  getRemainingSessionsCount,
  getCompletedSessionsCount,
  getCourseProgress,
  getDayOfWeekLabel,
  formatDaysOfWeek,
  formatClassTime,
  formatScheduleSummary,
} from './utils/scheduleUtils';

export {
  highlightText,
  searchCourses,
  searchStudents,
  searchEnrollments,
  searchAll,
} from './utils/search';
export type { SearchResult } from './utils/search';

export {
  supabaseLoadData,
  supabaseInsert,
  supabaseUpdate,
  supabaseDelete,
  supabaseBulkInsert,
} from './utils/supabaseStorage';

export { isElectron, isTauri } from './utils/tauri';

// ─── Hooks ───────────────────────────────────────────────────────
export { useAutoLock } from './hooks/useAutoLock';
export { useBackup } from './hooks/useBackup';
export type { BackupInfo } from './hooks/useBackup';

// ─── Types ───────────────────────────────────────────────────────
export * from './types/index';
