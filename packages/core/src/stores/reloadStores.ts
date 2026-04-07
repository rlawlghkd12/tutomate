import { clearAllCache } from '../utils/dataHelper';
import { useCourseStore } from './courseStore';
import { useStudentStore } from './studentStore';
import { useEnrollmentStore } from './enrollmentStore';
import { useMonthlyPaymentStore } from './monthlyPaymentStore';
import { usePaymentRecordStore } from './paymentRecordStore';
import { useNotificationStore } from './notificationStore';

function invalidateAllStores(): void {
  useCourseStore.getState().invalidate();
  useStudentStore.getState().invalidate();
  useEnrollmentStore.getState().invalidate();
  useMonthlyPaymentStore.getState().invalidate();
  usePaymentRecordStore.getState().invalidate();
}

export async function reloadAllStores(): Promise<void> {
  await clearAllCache();
  invalidateAllStores();
  useCourseStore.setState({ courses: [] });
  useStudentStore.setState({ students: [] });
  useEnrollmentStore.setState({ enrollments: [] });
  useMonthlyPaymentStore.setState({ payments: [] });
  usePaymentRecordStore.setState({ records: [] });
  // 알림도 해당 org 것으로 리로드
  useNotificationStore.setState({ notifications: [] });
  useNotificationStore.getState().loadNotifications();

  await Promise.all([
    useCourseStore.getState().loadCourses(),
    useStudentStore.getState().loadStudents(),
    useEnrollmentStore.getState().loadEnrollments(),
    useMonthlyPaymentStore.getState().loadPayments(),
    usePaymentRecordStore.getState().loadRecords(),
  ]);
}
