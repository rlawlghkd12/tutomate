import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import StudentForm from '../StudentForm';

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

const mockAddStudent = vi.fn().mockResolvedValue({ id: 's-new' });
const mockUpdateStudent = vi.fn().mockResolvedValue(undefined);
const mockDeleteStudent = vi.fn().mockResolvedValue(undefined);

vi.mock('@tutomate/core', () => ({
  useStudentStore: () => ({
    students: [],
    addStudent: mockAddStudent,
    updateStudent: mockUpdateStudent,
    deleteStudent: mockDeleteStudent,
  }),
  appConfig: {
    enableMemberFeature: false,
    hideAddressField: false,
    enableQuarterSystem: false,
  },
  formatPhone: (v: string) => v,
  parseBirthDate: (v: string) => v || undefined,
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

function makeStudent(
  overrides: Partial<import('@tutomate/core').Student> = {},
): import('@tutomate/core').Student {
  return {
    id: 's-1',
    name: '홍길동',
    phone: '010-1234-5678',
    birthDate: '1963-02-01',
    address: '서울시 강남구',
    notes: '메모',
    isMember: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('StudentForm', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders with empty form for new student', () => {
    render(<StudentForm visible={true} onClose={onClose} />);

    expect(screen.getByText('수강생 등록')).toBeInTheDocument();
    // phone field should be empty
    const phoneInput = screen.getByPlaceholderText('01012341234');
    expect(phoneInput).toHaveValue('');
  });

  it('renders with pre-filled data for editing', () => {
    const student = makeStudent();
    render(<StudentForm visible={true} onClose={onClose} student={student} />);

    expect(screen.getByText('수강생 정보 수정')).toBeInTheDocument();

    // name input should have value
    const nameInput = screen.getByPlaceholderText('김철수');
    expect(nameInput).toHaveValue('홍길동');

    // phone should show formatted value
    const phoneInput = screen.getByPlaceholderText('01012341234');
    expect(phoneInput).toHaveValue('010-1234-5678');
  });

  it('name and phone are required fields', async () => {
    render(<StudentForm visible={true} onClose={onClose} />);

    // Click submit without filling anything
    const submitBtn = screen.getByRole('button', { name: '등록' });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText('전화번호를 입력하세요')).toBeInTheDocument();
    });
  });

  it('submit button calls addStudent for new student', async () => {
    render(<StudentForm visible={true} onClose={onClose} />);

    // Fill the name via the combobox — type into the command input
    // In new-student mode the name field is a Combobox/Popover button.
    // We click it to open, then type.
    const comboboxBtn = screen.getByRole('combobox');
    fireEvent.click(comboboxBtn);

    const nameSearchInput = screen.getByPlaceholderText('이름 검색...');
    fireEvent.change(nameSearchInput, { target: { value: '새학생' } });

    // Fill phone
    const phoneInput = screen.getByPlaceholderText('01012341234');
    fireEvent.change(phoneInput, { target: { value: '010-5555-6666' } });

    // Submit
    const submitBtn = screen.getByRole('button', { name: '등록' });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockAddStudent).toHaveBeenCalled();
    });
  });

  it('submit button calls updateStudent for existing student', async () => {
    const student = makeStudent();
    render(<StudentForm visible={true} onClose={onClose} student={student} />);

    // Change phone
    const phoneInput = screen.getByPlaceholderText('01012341234');
    fireEvent.change(phoneInput, { target: { value: '010-9999-8888' } });

    const submitBtn = screen.getByRole('button', { name: '수정' });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockUpdateStudent).toHaveBeenCalledWith('s-1', expect.objectContaining({ name: '홍길동' }));
    });
  });

  it('delete button shows confirmation dialog', async () => {
    const student = makeStudent();
    render(<StudentForm visible={true} onClose={onClose} student={student} />);

    const deleteBtn = screen.getByRole('button', { name: '삭제' });
    fireEvent.click(deleteBtn);

    // Confirmation dialog should appear
    await waitFor(() => {
      expect(screen.getByText('수강생을 삭제하시겠습니까?')).toBeInTheDocument();
    });
  });
});
