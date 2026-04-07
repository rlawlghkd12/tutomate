import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import StudentList from '../StudentList';

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockStudents = vi.fn<() => import('@tutomate/core').Student[]>(() => []);
const mockEnrollments = vi.fn<() => import('@tutomate/core').Enrollment[]>(() => []);
const mockCourses = vi.fn<() => import('@tutomate/core').Course[]>(() => []);

vi.mock('@tutomate/core', () => ({
  useStudentStore: () => ({
    students: mockStudents(),
  }),
  useEnrollmentStore: () => ({
    enrollments: mockEnrollments(),
  }),
  useCourseStore: () => ({
    courses: mockCourses(),
  }),
  appConfig: {
    enableMemberFeature: false,
    hideAddressField: false,
    enableQuarterSystem: false,
  },
  formatPhone: (v: string) => v,
  parseBirthDate: (v: string) => v || undefined,
  useAuthStore: () => ({
    plan: 'trial',
  }),
  PLAN_LIMITS: {
    trial: { maxCourses: 5, maxStudentsPerCourse: 10 },
    basic: { maxCourses: Infinity, maxStudentsPerCourse: Infinity },
    admin: { maxCourses: Infinity, maxStudentsPerCourse: Infinity },
  },
  usePaymentRecordStore: () => ({
    addPayment: vi.fn(),
  }),
  getCurrentQuarter: () => '2026-Q2',
}));

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function makeStudent(
  overrides: Partial<import('@tutomate/core').Student> = {},
): import('@tutomate/core').Student {
  return {
    id: 's-1',
    name: '홍길동',
    phone: '010-1234-5678',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function renderStudentList() {
  return render(
    <MemoryRouter>
      <StudentList />
    </MemoryRouter>,
  );
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('StudentList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStudents.mockReturnValue([]);
    mockEnrollments.mockReturnValue([]);
    mockCourses.mockReturnValue([]);
  });

  it('renders empty state when no students', () => {
    renderStudentList();
    expect(screen.getByText('등록된 수강생이 없습니다')).toBeInTheDocument();
  });

  it('renders student rows with name, phone', () => {
    mockStudents.mockReturnValue([
      makeStudent(),
      makeStudent({ id: 's-2', name: '김철수', phone: '010-9876-5432' }),
    ]);
    renderStudentList();

    expect(screen.getByText('홍길동')).toBeInTheDocument();
    expect(screen.getByText('010-1234-5678')).toBeInTheDocument();
    expect(screen.getByText('김철수')).toBeInTheDocument();
    expect(screen.getByText('010-9876-5432')).toBeInTheDocument();
  });

  it('search input filters students', () => {
    mockStudents.mockReturnValue([
      makeStudent({ id: 's-1', name: '홍길동' }),
      makeStudent({ id: 's-2', name: '김철수', phone: '010-9876-5432' }),
    ]);
    renderStudentList();

    const input = screen.getByPlaceholderText('이름, 전화번호, 강좌, 메모 검색');
    fireEvent.change(input, { target: { value: '김철수' } });

    expect(screen.getByText('김철수')).toBeInTheDocument();
    expect(screen.queryByText('홍길동')).not.toBeInTheDocument();
  });

  it('"수강 신청" button is rendered for each student', () => {
    mockStudents.mockReturnValue([
      makeStudent({ id: 's-1', name: '홍길동' }),
      makeStudent({ id: 's-2', name: '김철수', phone: '010-9876-5432' }),
    ]);
    renderStudentList();

    const enrollButtons = screen.getAllByText('수강 신청');
    expect(enrollButtons).toHaveLength(2);
  });

  it('clicking student name opens StudentForm modal', () => {
    mockStudents.mockReturnValue([makeStudent()]);
    renderStudentList();

    fireEvent.click(screen.getByText('홍길동'));

    // StudentForm modal should appear with edit title
    expect(screen.getByText('수강생 정보 수정')).toBeInTheDocument();
  });
});
