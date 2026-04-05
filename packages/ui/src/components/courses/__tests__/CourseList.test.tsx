import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import CourseList from '../CourseList';

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockCourses = vi.fn<() => import('@tutomate/core').Course[]>(() => []);
const mockGetEnrollmentCountByCourseId = vi.fn<(id: string) => number>(() => 0);

vi.mock('@tutomate/core', () => ({
  useCourseStore: () => ({ courses: mockCourses() }),
  useEnrollmentStore: () => ({
    getEnrollmentCountByCourseId: mockGetEnrollmentCountByCourseId,
  }),
  appConfig: {
    enableMemberFeature: false,
    hideAddressField: false,
    enableQuarterSystem: false,
  },
}));

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function makeCourse(overrides: Partial<import('@tutomate/core').Course> = {}): import('@tutomate/core').Course {
  return {
    id: 'c-1',
    name: '수학 기초',
    classroom: 'A동 101호',
    instructorName: '김선생',
    instructorPhone: '010-1111-2222',
    fee: 100000,
    maxStudents: 20,
    currentStudents: 0,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function renderCourseList() {
  return render(
    <MemoryRouter>
      <CourseList />
    </MemoryRouter>,
  );
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('CourseList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCourses.mockReturnValue([]);
    mockGetEnrollmentCountByCourseId.mockReturnValue(0);
  });

  it('renders empty state when no courses', () => {
    renderCourseList();
    expect(screen.getByText('등록된 강좌가 없습니다')).toBeInTheDocument();
  });

  it('renders course rows with name, classroom, instructor', () => {
    mockCourses.mockReturnValue([
      makeCourse(),
      makeCourse({
        id: 'c-2',
        name: '영어 회화',
        classroom: 'B동 202호',
        instructorName: '박선생',
        instructorPhone: '010-3333-4444',
        fee: 150000,
      }),
    ]);
    renderCourseList();

    expect(screen.getByText('수학 기초')).toBeInTheDocument();
    expect(screen.getByText('A동 101호')).toBeInTheDocument();
    expect(screen.getByText('김선생')).toBeInTheDocument();

    expect(screen.getByText('영어 회화')).toBeInTheDocument();
    expect(screen.getByText('B동 202호')).toBeInTheDocument();
    expect(screen.getByText('박선생')).toBeInTheDocument();
  });

  it('search input filters courses by name', () => {
    mockCourses.mockReturnValue([
      makeCourse({ id: 'c-1', name: '수학 기초' }),
      makeCourse({ id: 'c-2', name: '영어 회화', classroom: 'B동', instructorName: '이선생' }),
    ]);
    renderCourseList();

    const input = screen.getByPlaceholderText('강좌명, 강의실, 강사명, 전화번호 검색');
    fireEvent.change(input, { target: { value: '영어' } });

    expect(screen.getByText('영어 회화')).toBeInTheDocument();
    expect(screen.queryByText('수학 기초')).not.toBeInTheDocument();
  });

  it('clicking course name calls navigate', () => {
    mockCourses.mockReturnValue([makeCourse()]);
    renderCourseList();

    fireEvent.click(screen.getByText('수학 기초'));
    expect(mockNavigate).toHaveBeenCalledWith('/courses/c-1');
  });

  it('shows "현재 강좌" and "종료된 강좌" tabs', () => {
    mockCourses.mockReturnValue([]);
    renderCourseList();

    expect(screen.getByText(/현재 강좌/)).toBeInTheDocument();
    expect(screen.getByText(/종료된 강좌/)).toBeInTheDocument();
  });
});
