import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { QuarterSelect } from '../QuarterSelect';

const mockEnrollments = vi.fn<() => { quarter: string }[]>(() => []);
const setSelectedQuarter = vi.fn();
let selectedQuarter = '2026-Q2';

vi.mock('sonner', () => ({ toast: vi.fn() }));

vi.mock('@tutomate/core', () => ({
  useEnrollmentStore: (sel: (s: { enrollments: unknown[] }) => unknown) =>
    sel({ enrollments: mockEnrollments() }),
  useQuarterStore: (sel: (s: { selectedQuarter: string; setSelectedQuarter: typeof setSelectedQuarter }) => unknown) =>
    sel({ selectedQuarter, setSelectedQuarter }),
  getCurrentQuarter: () => '2026-Q2',
  getQuarterLabel: (q: string) => {
    const [year, n] = q.split('-Q');
    return `${year}년 ${n}분기`;
  },
}));

describe('QuarterSelect', () => {
  beforeEach(() => {
    selectedQuarter = '2026-Q2';
    setSelectedQuarter.mockClear();
    mockEnrollments.mockReturnValue([]);
  });

  function renderAt(pathname: string) {
    return render(
      <MemoryRouter initialEntries={[pathname]}>
        <QuarterSelect />
      </MemoryRouter>,
    );
  }

  it('renders the trigger without crashing on a quarter route', () => {
    renderAt('/');
    expect(screen.getByText('2026년 4~6월')).toBeInTheDocument();
  });

  it('always renders, even on a quarter-unrelated route', () => {
    renderAt('/settings');
    expect(screen.getByText('2026년 4~6월')).toBeInTheDocument();
  });

  it('opens the dropdown and renders the grouped label + options without throwing', async () => {
    const user = userEvent.setup();
    renderAt('/');
    await user.click(screen.getByRole('combobox'));
    // SelectLabel lives inside SelectGroup — this is what previously rendered bare.
    expect(await screen.findByText('어느 분기를 볼까요?')).toBeInTheDocument();
    expect(screen.getByRole('group')).toBeInTheDocument();
  });
});
