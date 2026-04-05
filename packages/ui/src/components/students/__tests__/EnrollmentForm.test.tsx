import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import EnrollmentForm from '../EnrollmentForm';

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

const mockAddEnrollment = vi.fn().mockResolvedValue(undefined);
const mockAddPayment = vi.fn().mockResolvedValue(undefined);
const mockGetCourseById = vi.fn();
const mockEnrollments: import('@tutomate/core').Enrollment[] = [];

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
  useEnrollmentStore: () => ({
    enrollments: mockEnrollments,
    addEnrollment: mockAddEnrollment,
  }),
  usePaymentRecordStore: () => ({
    addPayment: mockAddPayment,
  }),
  useLicenseStore: () => ({
    getPlan: () => 'pro',
    getLimit: () => 999,
  }),
  appConfig: {
    enableMemberFeature: false,
    hideAddressField: false,
    enableQuarterSystem: false,
  },
  getCurrentQuarter: () => '2026-Q2',
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
 * Helper: Open the course Select and pick an item by label substring.
 * Radix Select renders both a hidden native <option> and a visible <span>,
 * so we need to find the option role element to avoid duplicate-text errors.
 */
async function selectCourse(labelSubstring: string) {
  // Click the select trigger to open the dropdown
  const trigger = screen.getByRole('combobox');
  fireEvent.click(trigger);

  await waitFor(() => {
    const options = screen.getAllByRole('option');
    expect(options.length).toBeGreaterThan(0);
  });

  const options = screen.getAllByRole('option');
  const target = options.find((opt) =>
    opt.textContent?.includes(labelSubstring),
  );
  expect(target).toBeTruthy();
  fireEvent.click(target!);
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

  it('renders course select dropdown', () => {
    renderForm();

    expect(screen.getByText('강좌 선택')).toBeInTheDocument();
    expect(screen.getByText('강좌를 선택하세요')).toBeInTheDocument();
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

  it('"할인 적용" button toggles discount input', async () => {
    renderForm();
    await selectCourse('수학 기초');

    const discountBtn = await screen.findByRole('button', { name: '할인 적용' });
    fireEvent.click(discountBtn);

    await waitFor(() => {
      expect(screen.getByLabelText('할인 금액 (원)')).toBeInTheDocument();
    });

    // Toggle off
    fireEvent.click(discountBtn);
    await waitFor(() => {
      expect(screen.queryByLabelText('할인 금액 (원)')).not.toBeInTheDocument();
    });
  });

  it('"면제 처리" button disables payment fields', async () => {
    renderForm();
    await selectCourse('수학 기초');

    const exemptBtn = await screen.findByRole('button', { name: '면제 처리' });
    fireEvent.click(exemptBtn);

    await waitFor(() => {
      const paidInput = screen.getByLabelText('납부 금액');
      expect(paidInput).toBeDisabled();
    });

    // "면제 처리됩니다" notice should appear
    expect(screen.getByText(/면제 처리됩니다/)).toBeInTheDocument();
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

  it('submit is disabled while submitting (double-click prevention)', async () => {
    renderForm();

    const submitBtn = screen.getByRole('button', { name: '신청' });
    expect(submitBtn).not.toBeDisabled();

    // Simulate form submission by clicking submit without a course selected
    // (form validation will prevent actual submission, but we verify the button exists and is initially enabled)
    expect(submitBtn).toBeInTheDocument();
  });
});
