import type { Enrollment, Student, Course, Attendance } from '../types';
import dayjs from 'dayjs';
import { useNotificationStore } from '../stores/notificationStore';

// 미납 알림 생성 (30일 이상 미납)
export const generatePaymentOverdueNotifications = (
  enrollments: Enrollment[],
  students: Student[],
  courses: Course[]
) => {
  const { addNotification } = useNotificationStore.getState();
  const overdueThreshold = 30; // 30일

  enrollments.forEach((enrollment) => {
    if (enrollment.paymentStatus === 'pending' || enrollment.paymentStatus === 'partial') {
      const daysSinceEnrollment = dayjs().diff(dayjs(enrollment.enrolledAt), 'day');

      if (daysSinceEnrollment >= overdueThreshold) {
        const student = students.find((s) => s.id === enrollment.studentId);
        const course = courses.find((c) => c.id === enrollment.courseId);

        if (student && course) {
          addNotification({
            type: 'payment_overdue',
            title: '납부 기한 경과',
            message: `${student.name}님의 ${course.name} 강좌 수강료가 ${daysSinceEnrollment}일째 미납 상태입니다. (잔액: ₩${enrollment.remainingAmount.toLocaleString()})`,
            relatedId: enrollment.studentId,
            relatedType: 'student',
            priority: 'high',
          });
        }
      }
    }
  });
};

// 출석률 저조 알림 생성 (50% 미만)
export const generateLowAttendanceNotifications = (
  enrollments: Enrollment[],
  attendances: Attendance[],
  students: Student[],
  courses: Course[]
) => {
  const { addNotification } = useNotificationStore.getState();
  const lowAttendanceThreshold = 50; // 50%

  enrollments.forEach((enrollment) => {
    const studentAttendances = attendances.filter(
      (a) => a.courseId === enrollment.courseId && a.studentId === enrollment.studentId
    );

    if (studentAttendances.length >= 3) { // 최소 3회 이상 수업이 있을 때만
      const presentCount = studentAttendances.filter((a) => a.status === 'present').length;
      const lateCount = studentAttendances.filter((a) => a.status === 'late').length;
      const totalSessions = studentAttendances.length;
      const attendanceRate = ((presentCount + lateCount * 0.5) / totalSessions) * 100;

      if (attendanceRate < lowAttendanceThreshold) {
        const student = students.find((s) => s.id === enrollment.studentId);
        const course = courses.find((c) => c.id === enrollment.courseId);

        if (student && course) {
          addNotification({
            type: 'low_attendance',
            title: '출석률 저조 경고',
            message: `${student.name}님의 ${course.name} 강좌 출석률이 ${attendanceRate.toFixed(1)}%로 낮습니다. (${presentCount}/${totalSessions}회 출석)`,
            relatedId: enrollment.studentId,
            relatedType: 'student',
            priority: 'medium',
          });
        }
      }
    }
  });
};

// 납부 예정 알림 생성 (등록 후 7일, 14일, 21일째)
export const generatePaymentReminderNotifications = (
  enrollments: Enrollment[],
  students: Student[],
  courses: Course[]
) => {
  const { addNotification } = useNotificationStore.getState();
  const reminderDays = [7, 14, 21];

  enrollments.forEach((enrollment) => {
    if (enrollment.paymentStatus !== 'completed') {
      const daysSinceEnrollment = dayjs().diff(dayjs(enrollment.enrolledAt), 'day');

      if (reminderDays.includes(daysSinceEnrollment)) {
        const student = students.find((s) => s.id === enrollment.studentId);
        const course = courses.find((c) => c.id === enrollment.courseId);

        if (student && course) {
          addNotification({
            type: 'payment_reminder',
            title: '납부 안내',
            message: `${student.name}님의 ${course.name} 강좌 수강료 납부를 확인해주세요. (잔액: ₩${enrollment.remainingAmount.toLocaleString()})`,
            relatedId: enrollment.studentId,
            relatedType: 'student',
            priority: 'low',
          });
        }
      }
    }
  });
};

// 모든 알림 생성 (하루에 한 번 실행)
export const generateAllNotifications = (
  enrollments: Enrollment[],
  students: Student[],
  courses: Course[],
  attendances: Attendance[]
) => {
  // 기존 알림이 오늘 생성되었는지 확인
  const lastGeneratedDate = localStorage.getItem('lastNotificationGeneration');
  const today = dayjs().format('YYYY-MM-DD');

  if (lastGeneratedDate === today) {
    return; // 오늘 이미 생성됨
  }

  generatePaymentOverdueNotifications(enrollments, students, courses);
  generateLowAttendanceNotifications(enrollments, attendances, students, courses);
  generatePaymentReminderNotifications(enrollments, students, courses);

  localStorage.setItem('lastNotificationGeneration', today);
};
