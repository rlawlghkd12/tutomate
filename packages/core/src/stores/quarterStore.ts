import { create } from 'zustand';
import { getCurrentQuarter } from '../utils/quarterUtils';

const STORAGE_KEY = 'app:selectedQuarter';
const QUARTER_RE = /^\d{4}-Q[1-4]$/;

function initialQuarter(): string {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored && QUARTER_RE.test(stored)) return stored;
  } catch {
    // sessionStorage 접근 불가 시 현재 분기로 폴백
  }
  return getCurrentQuarter();
}

interface QuarterStore {
  selectedQuarter: string;
  setSelectedQuarter: (quarter: string) => void;
}

export const useQuarterStore = create<QuarterStore>((set) => ({
  selectedQuarter: initialQuarter(),
  setSelectedQuarter: (quarter: string) => {
    if (!QUARTER_RE.test(quarter)) return;
    try {
      sessionStorage.setItem(STORAGE_KEY, quarter);
    } catch {
      // 저장 실패는 무시 (상태는 메모리에 유지)
    }
    set({ selectedQuarter: quarter });
  },
}));
