// ─── Config ──────────────────────────────────────────────────────
export { appConfig } from './config/appConfig';
export { APP_NAME, useAppVersion } from './config/version';
export { supabase, isSupabaseConfigured } from './config/supabase';
export { PLAN_LIMITS, PlanTypeEnum } from './config/planLimits';
export type { PlanType, PlanLimitKey } from './config/planLimits';
export {
  FLEX_CENTER,
  FLEX_BETWEEN,
  EXEMPT_COLOR,
  useChartColors,
  useChartTooltipStyle,
} from './config/styles';
export type { ChartColors, ChartTooltipStyle } from './config/styles';

// ─── OAuth ───────────────────────────────────────────────────────
export { parseOAuthCallback, OAUTH_PROVIDERS } from './lib/oauth';
export type { OAuthProvider, OAuthProviderConfig, OAuthCallbackResult, OAuthCallbackError } from './lib/oauth';

// ─── Stores ──────────────────────────────────────────────────────
export { useSettingsStore } from './stores/settingsStore';
export type { FontSize, Theme } from './stores/settingsStore';
export { useAuthStore, isCloud, getOrgId, getPlan, isOwner, getAuthProvider, getAuthProviderLabel, getAuthProviderColor } from './stores/authStore';
export { useCourseStore } from './stores/courseStore';
export { useStudentStore } from './stores/studentStore';
export { useEnrollmentStore } from './stores/enrollmentStore';
export { useMonthlyPaymentStore } from './stores/monthlyPaymentStore';
export { usePaymentRecordStore } from './stores/paymentRecordStore';
export { reloadAllStores } from './stores/reloadStores';
export { useLockStore } from './stores/lockStore';
export { useNotificationStore } from './stores/notificationStore';

// ─── Utils ───────────────────────────────────────────────────────
export { createDataHelper, clearAllCache } from './utils/dataHelper';
export type { DataHelper, LoadResult } from './utils/dataHelper';

export { default as dayjs } from './utils/dayjs';

export {
  ErrorType,
  ErrorCode,
  AppError,
  ErrorHandler,
  errorHandler,
  handleError,
  createError,
  setErrorDisplay,
  showErrorMessage,
  USER_ERROR_MESSAGES,
} from './utils/errors';
export type { AppErrorOptions, ErrorCodeType } from './utils/errors';

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
  mapPaymentRecordFromDb,
  mapPaymentRecordToDb,
  mapPaymentRecordUpdateToDb,
} from './utils/fieldMapper';
export type {
  CourseRow,
  StudentRow,
  EnrollmentRow,
  MonthlyPaymentRow,
  PaymentRecordRow,
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

export { reportError } from './utils/errorReporter';

export { isElectron, isTauri } from './utils/tauri';

export {
  getCurrentQuarter,
  getQuarterLabel,
  getQuarterOptions,
  getQuarterMonths,
  quarterMonthToYYYYMM,
} from './utils/quarterUtils';

// ─── Hooks ───────────────────────────────────────────────────────
export { useAutoLock } from './hooks/useAutoLock';

// ─── Types ───────────────────────────────────────────────────────
export * from './types/index';
