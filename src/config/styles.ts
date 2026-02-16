import { theme } from 'antd';
import type { CSSProperties } from 'react';

const { useToken } = theme;

// ─── Layout Constants ────────────────────────────────────────────

export const FLEX_CENTER: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

export const FLEX_BETWEEN: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
};

// ─── Custom Color Constants ──────────────────────────────────────

/** 면제(exempt) 상태 전용 보라색 — Ant Design 토큰에 없는 커스텀 색상 */
export const EXEMPT_COLOR = '#722ed1';

// ─── Chart Hooks ─────────────────────────────────────────────────

export interface ChartColors {
  success: string;
  primary: string;
  error: string;
  warning: string;
  exempt: string;
  text: string;
  border: string;
  bgContainer: string;
}

export function useChartColors(): ChartColors {
  const { token } = useToken();
  return {
    success: token.colorSuccess,
    primary: token.colorPrimary,
    error: token.colorError,
    warning: token.colorWarning,
    exempt: EXEMPT_COLOR,
    text: token.colorText,
    border: token.colorBorderSecondary,
    bgContainer: token.colorBgContainer,
  };
}

export interface ChartTooltipStyle {
  contentStyle: CSSProperties;
  labelStyle: CSSProperties;
}

export function useChartTooltipStyle(): ChartTooltipStyle {
  const { token } = useToken();
  return {
    contentStyle: {
      backgroundColor: token.colorBgContainer,
      border: `1px solid ${token.colorBorder}`,
      borderRadius: 6,
      color: token.colorText,
    },
    labelStyle: {
      color: token.colorText,
    },
  };
}
