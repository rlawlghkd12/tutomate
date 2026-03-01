// 강좌 일정 인터페이스
export interface CourseSchedule {
  startDate: string; // 강좌 시작일 YYYY-MM-DD
  endDate?: string; // 강좌 종료일 YYYY-MM-DD (선택)
  daysOfWeek: number[]; // 수업 요일 (0=일요일, 1=월요일, ..., 6=토요일)
  startTime: string; // 수업 시작 시간 HH:mm
  endTime: string; // 수업 종료 시간 HH:mm
  totalSessions: number; // 총 수업 회차
  holidays: string[]; // 휴강일 목록 YYYY-MM-DD[]
}

// 강좌 인터페이스
export interface Course {
  id: string;
  name: string; // 강좌 이름
  classroom: string; // 강의실 이름
  instructorName: string; // 강사 이름
  instructorPhone: string; // 강사 전화번호
  fee: number; // 수강료
  maxStudents: number; // 최대 인원
  currentStudents: number; // 현재 수강생 수
  schedule?: CourseSchedule; // 강좌 일정 (선택)
  createdAt: string;
  updatedAt: string;
}

// 수강생/회원 인터페이스
export interface Student {
  id: string;
  name: string; // 회원 이름
  phone: string; // 전화번호
  email?: string; // 이메일 (선택)
  address?: string; // 주소 (선택)
  birthDate?: string; // 생년월일 (선택)
  notes?: string; // 메모
  createdAt: string;
  updatedAt: string;
}

// 납부 방법
export type PaymentMethod = 'cash' | 'card' | 'transfer';

// 수강 신청 인터페이스
export interface Enrollment {
  id: string;
  courseId: string;
  studentId: string;
  enrolledAt: string;
  paymentStatus: 'pending' | 'partial' | 'completed' | 'exempt'; // 납부 현황 (exempt: 면제)
  paidAmount: number; // 납부 금액
  remainingAmount: number; // 잔여 금액
  paidAt?: string; // 마지막 납부일 YYYY-MM-DD
  paymentMethod?: PaymentMethod; // 납부 방법 (현금, 카드, 계좌이체)
  discountAmount: number; // 할인 금액
  notes?: string;
}

// 강좌 폼 데이터 타입
export type CourseFormData = Omit<Course, 'id' | 'currentStudents' | 'createdAt' | 'updatedAt'>;

// 수강생 폼 데이터 타입
export type StudentFormData = Omit<Student, 'id' | 'createdAt' | 'updatedAt'>;

// 수강 신청 폼 데이터 타입
export type EnrollmentFormData = Omit<Enrollment, 'id' | 'enrolledAt' | 'remainingAmount'>;

// 납부 방법 라벨 맵
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: '현금',
  card: '카드',
  transfer: '계좌이체',
};

// 월별 납부 기록
export interface MonthlyPayment {
  id: string;
  enrollmentId: string;
  month: string; // YYYY-MM 형식
  amount: number; // 해당 월 납부 금액
  paidAt?: string; // 납부일 YYYY-MM-DD
  paymentMethod?: PaymentMethod;
  status: 'pending' | 'paid'; // 미납 / 납부
  notes?: string;
  createdAt: string;
}

// 라이선스 인터페이스
export interface LicenseInfo {
  licenseKey: string;
  activatedAt: string;
}

// 조직 인터페이스 (Supabase)
export interface Organization {
  id: string;
  name: string;
  licenseKey: string;
  plan: string;
  maxSeats: number;
  createdAt: string;
  updatedAt: string;
}

// 알림 인터페이스
export interface Notification {
  id: string;
  type: 'payment_overdue' | 'payment_reminder' | 'info';
  title: string;
  message: string;
  relatedId?: string; // 관련 수강생 또는 강좌 ID
  relatedType?: 'student' | 'course' | 'enrollment';
  isRead: boolean;
  createdAt: string;
  priority: 'low' | 'medium' | 'high';
}
