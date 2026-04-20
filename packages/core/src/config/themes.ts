/**
 * 테마 카탈로그 — 5종.
 * CSS 변수는 `packages/ui/src/index.css`의 `[data-theme="..."]` 블록에서 정의.
 * 자동 OS 연동은 별도 설정(autoThemeSync)으로 관리.
 */

export type ThemeId = 'light' | 'dark' | 'sepia' | 'high-contrast' | 'slate';

export interface ThemeDefinition {
  id: ThemeId;
  label: string;
  /** 기본 컬러 모드 — 어두운 배경이면 'dark' */
  mode: 'light' | 'dark';
  description: string;
  /** 갤러리 미리보기 스와치 3색 (bg / fg / accent) */
  preview: {
    bg: string;
    fg: string;
    accent: string;
  };
}

export const THEMES: ThemeDefinition[] = [
  {
    id: 'light',
    label: '라이트',
    mode: 'light',
    description: '기본 화이트 톤',
    preview: { bg: '#ffffff', fg: '#1c1c1e', accent: '#0060df' },
  },
  {
    id: 'dark',
    label: '다크',
    mode: 'dark',
    description: '눈 부담 적은 어두운 배경',
    preview: { bg: '#141414', fg: '#e6e6e6', accent: '#60a5fa' },
  },
  {
    id: 'sepia',
    label: '세피아',
    mode: 'light',
    description: '크림톤 · 장시간 사용에 편안',
    preview: { bg: '#f4ecd8', fg: '#3e2f1f', accent: '#8b5a2b' },
  },
  {
    id: 'high-contrast',
    label: '고대비',
    mode: 'light',
    description: '시력 약한 분께 권장 (WCAG AAA)',
    preview: { bg: '#ffffff', fg: '#000000', accent: '#0040a0' },
  },
  {
    id: 'slate',
    label: '슬레이트',
    mode: 'dark',
    description: '회청색 다크 · 차분한 톤',
    preview: { bg: '#1a2130', fg: '#d0d6e0', accent: '#7dd3fc' },
  },
];

/** 유효한 ThemeId인지 검증 + fallback */
export function resolveTheme(value: unknown): ThemeId {
  if (typeof value !== 'string') return 'light';
  if (THEMES.some((t) => t.id === value)) return value as ThemeId;
  return 'light';
}

/** 해당 테마의 base mode — `dark` 클래스 부착 판단에 사용 */
export function getThemeMode(id: ThemeId): 'light' | 'dark' {
  return THEMES.find((t) => t.id === id)?.mode ?? 'light';
}
