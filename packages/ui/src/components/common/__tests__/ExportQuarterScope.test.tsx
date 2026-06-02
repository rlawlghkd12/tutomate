import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect } from 'vitest';
import { ExportQuarterScope, EXPORT_SCOPE_ALL } from '../ExportQuarterScope';

vi.mock('@tutomate/core', () => ({
  getQuarterLabel: (q: string) => {
    const [year, n] = q.split('-Q');
    return `${year}년 ${n}분기`;
  },
}));

describe('ExportQuarterScope', () => {
  describe('follow mode (no quarters prop)', () => {
    it('renders 이번 분기 / 전체 분기 toggle with the current quarter label', () => {
      render(
        <ExportQuarterScope value="2026-Q2" onChange={() => {}} currentQuarter="2026-Q2" />,
      );
      expect(screen.getByText('2026년 2분기')).toBeInTheDocument();
      expect(screen.getByText('전체 분기')).toBeInTheDocument();
      expect(screen.getByText('2026년 2분기 수강 정보만 내보냅니다.')).toBeInTheDocument();
    });

    it('calls onChange with "all" when 전체 분기 is clicked', async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();
      render(
        <ExportQuarterScope value="2026-Q2" onChange={onChange} currentQuarter="2026-Q2" />,
      );
      await user.click(screen.getByText('전체 분기'));
      expect(onChange).toHaveBeenCalledWith(EXPORT_SCOPE_ALL);
    });

    it('calls onChange with the current quarter when 이번 분기 is clicked while on all', async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();
      render(
        <ExportQuarterScope value={EXPORT_SCOPE_ALL} onChange={onChange} currentQuarter="2026-Q2" />,
      );
      await user.click(screen.getByText('2026년 2분기'));
      expect(onChange).toHaveBeenCalledWith('2026-Q2');
    });

    it('shows the all-scope hint when value is all', () => {
      render(
        <ExportQuarterScope value={EXPORT_SCOPE_ALL} onChange={() => {}} currentQuarter="2026-Q2" />,
      );
      expect(screen.getByText('모든 기간의 수강 정보를 내보냅니다.')).toBeInTheDocument();
    });
  });

  describe('pick mode (quarters prop)', () => {
    const quarters = [
      { value: '2026-Q1', label: '2026년 1분기' },
      { value: '2026-Q2', label: '2026년 2분기' },
    ];

    it('renders a dropdown and the per-quarter hint', () => {
      render(
        <ExportQuarterScope value="2026-Q2" onChange={() => {}} quarters={quarters} />,
      );
      expect(screen.getByRole('combobox')).toBeInTheDocument();
      expect(screen.getByText('2026년 2분기 수강 정보만 내보냅니다.')).toBeInTheDocument();
    });

    it('shows the all-scope hint when value is all', () => {
      render(
        <ExportQuarterScope value={EXPORT_SCOPE_ALL} onChange={() => {}} quarters={quarters} />,
      );
      expect(screen.getByText('모든 기간의 수강 정보를 내보냅니다.')).toBeInTheDocument();
    });

    it('uses a custom noun in the hint when provided (e.g. 수익 정보)', () => {
      render(
        <ExportQuarterScope value="2026-Q2" onChange={() => {}} quarters={quarters} noun="수익 정보" />,
      );
      expect(screen.getByText('2026년 2분기 수익 정보만 내보냅니다.')).toBeInTheDocument();
    });
  });
});
