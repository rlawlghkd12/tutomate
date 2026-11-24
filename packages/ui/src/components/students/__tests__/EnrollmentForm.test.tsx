import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import EnrollmentForm from '../EnrollmentForm';

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

const mockAddEnrollment = vi.fn().mockResolvedValue(undefined);
const mockAddPayment = vi.fn().mockResolvedValue(undefined);
const mockGetCourseById = vi.fn();
const mockUpdateEnrollment = vi.fn().mockResolvedValue(undefined);
const mockEnrollments: import('@tutomate/core').Enrollment[] = [];
const mockAppConfig = vi.hoisted(() => ({
  enableMemberFeature: false,
  hideAddressField: false,
  enableQuarterSystem: false,
}));

vi.mock('@tutomate/core', () => ({
  useCourseStore: () => ({
    courses: [
      {
        id: 'course-1',
        name: '수학 기초',
        classroom: 'A101',
        instructorName: '김선생',
        instructorPhone: '010-1111-2222',
        fee: 100000,
        maxStudents: 20,
        currentStudents: 0,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'course-2',
        name: '영어 회화',
        classroom: 'B202',
        instructorName: '박선생',
        instructorPhone: '010-3333-4444',
        fee: 150000,
        maxStudents: 15,
        currentStudents: 0,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ],
    getCourseById: mockGetCourseById,
  }),
  useEnrollmentStore: Object.assign(
    () => ({
      enrollments: mockEnrollments,
      addEnrollment: mockAddEnrollment,
      updateEnrollment: mockUpdateEnrollment,
    }),
    { getState: () => ({ enrollments: mockEnrollments }) },
  ),
  usePaymentRecordStore: () => ({
    addPayment: mockAddPayment,
  }),
  useAuthStore: () => ({
    plan: 'basic',
  }),
  PLAN_LIMITS: {
    trial: { maxCourses: 5, maxStudentsPerCourse: 10 },
    basic: { maxCourses: Infinity, maxStudentsPerCourse: Infinity },
    admin: { maxCourses: Infinity, maxStudentsPerCourse: Infinity },
  },
  appConfig: mockAppConfig,
  getCurrentQuarter: () => '2026-Q2',
  isActiveEnrollment: (e: { paymentStatus: string }) => e.paymentStatus !== 'withdrawn',
  isCourseEnded: () => false,
  PaymentStatus: {
    PENDING: 'pending',
    PARTIAL: 'partial',
    COMPLETED: 'completed',
    EXEMPT: 'exempt',
    WITHDRAWN: 'withdrawn',
  },
  DAY_LABELS: ['일', '월', '화', '수', '목', '금', '토'],
  formatTime12: (time: string) => time,
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const student: import('@tutomate/core').Student = {
  id: 's-1',
  name: '홍길동',
  phone: '010-1234-5678',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

function renderForm(visible = true) {
  return render(
    <EnrollmentForm visible={visible} onClose={vi.fn()} student={student} />,
  );
}

/**
 * Helper: pick a course from the step-1 button list, then advance to the
 * payment step (step 2) via the "다음 →" button.
 */
async function selectCourse(courseName: string) {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(courseName) }));
  fireEvent.click(screen.getByRole('button', { name: /다음/ }));
  await waitFor(() => {
    expect(screen.getByText('납부 방법')).toBeInTheDocument();
  });
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('EnrollmentForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCourseById.mockImplementation((id: string) => {
      if (id === 'course-1')
        return {
          id: 'course-1',
          name: '수학 기초',
          fee: 100000,
          maxStudents: 20,
        };
      if (id === 'course-2')
        return {
          id: 'course-2',
          name: '영어 회화',
          fee: 150000,
          maxStudents: 15,
        };
      return undefined;
    });
  });

  it('renders the course selection step', () => {
    renderForm();

    expect(screen.getByText('강좌 선택')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('강좌명 검색...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /수학 기초/ })).toBeInTheDocument();
  });

  it('selecting a course shows payment section', async () => {
    renderForm();

    await selectCourse('수학 기초');

    // Payment-related labels should now be visible
    await waitFor(() => {
      expect(screen.getByText('납부 금액')).toBeInTheDocument();
    });
    expect(screen.getByText('납부 방법')).toBeInTheDocument();
  });

  it('discount row is available in the payment step', async () => {
    renderForm();
    await selectCourse('수학 기초');

    // Discount is an inline summary row (no toggle button anymore).
    expect(screen.getByText('할인')).toBeInTheDocument();
  });

  it('"면제 처리" button hides payment fields', async () => {
    renderForm();
    await selectCourse('수학 기초');

    fireEvent.click(screen.getByRole('button', { name: '면제 처리' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '면제 해제' })).toBeInTheDocument();
    });
    expect(screen.queryByText('납부 방법')).not.toBeInTheDocument();
  });

  it('payment method buttons (현금/카드/계좌이체) are selectable', async () => {
    renderForm();
    await selectCourse('수학 기초');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '현금' })).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: '카드' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '계좌이체' })).toBeInTheDocument();

    // Click "카드"
    fireEvent.click(screen.getByRole('button', { name: '카드' }));
    // The button should visually update (checked via aria/class is enough; we verify no crash)
    expect(screen.getByRole('button', { name: '카드' })).toBeInTheDocument();
  });

  it('submit button (신청) is enabled on the payment step', async () => {
    renderForm();
    await selectCourse('수학 기초');

    const submitBtn = screen.getByRole('button', { name: '신청' });
    expect(submitBtn).not.toBeDisabled();
  });

  describe('수강 포기 기록 재활성화 (분기제)', () => {
    const withdrawn = (quarter: string) =>
      ({
        id: `w-${quarter}`,
        courseId: 'course-1',
        studentId: 's-1',
        paymentStatus: 'withdrawn',
        paidAmount: 0,
        remainingAmount: 0,
        discountAmount: 0,
        quarter,
        enrolledAt: '2026-01-01T00:00:00Z',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      }) as unknown as import('@tutomate/core').Enrollment;

    beforeEach(() => {
      mockAppConfig.enableQuarterSystem = true;
    });
    afterEach(() => {
      mockAppConfig.enableQuarterSystem = false;
      mockEnrollments.length = 0;
    });

    it('다른 분기의 포기 기록은 건드리지 않고 새로 등록', async () => {
      mockEnrollments.push(withdrawn('2026-Q4'));
      renderForm();
      await selectCourse('수학 기초');
      fireEvent.click(screen.getByRole('button', { name: '신청' }));
      await waitFor(() => expect(mockAddEnrollment).toHaveBeenCalled());
      expect(mockAddEnrollment.mock.calls[0][0]).toMatchObject({ courseId: 'course-1', quarter: '2026-Q2' });
      expect(mockUpdateEnrollment).not.toHaveBeenCalled();
    });

    it('같은 분기의 포기 기록은 다시 살림', async () => {
      mockEnrollments.push(withdrawn('2026-Q2'));
      renderForm();
      await selectCourse('수학 기초');
      fireEvent.click(screen.getByRole('button', { name: '신청' }));
      await waitFor(() => expect(mockUpdateEnrollment).toHaveBeenCalled());
      expect(mockUpdateEnrollment.mock.calls[0][0]).toBe('w-2026-Q2');
      expect(mockAddEnrollment).not.toHaveBeenCalled();
    });
  });
});
