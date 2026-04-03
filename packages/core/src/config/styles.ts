import type { CSSProperties } from 'react';

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

/** 면제(exempt) 상태 전용 보라색 */
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
  hoverFill: string;
}

export function useChartColors(): ChartColors {
  return {
    success: '#22c55e',
    primary: '#3b82f6',
    error: '#ef4444',
    warning: '#f59e0b',
    exempt: EXEMPT_COLOR,
    text: 'hsl(var(--foreground, 0 0% 3.9%))',
    border: 'hsl(var(--border, 0 0% 89.8%))',
    bgContainer: 'hsl(var(--background, 0 0% 100%))',
    hoverFill: 'hsl(var(--muted, 0 0% 96.1%))',
  };
}

export interface ChartTooltipStyle {
  contentStyle: CSSProperties;
  labelStyle: CSSProperties;
  itemStyle: CSSProperties;
}

export function useChartTooltipStyle(): ChartTooltipStyle {
  return {
    contentStyle: {
      backgroundColor: 'hsl(var(--background, 0 0% 100%))',
      border: '1px solid hsl(var(--border, 0 0% 89.8%))',
      borderRadius: 6,
    },
    labelStyle: {
      color: 'hsl(var(--foreground, 0 0% 3.9%))',
    },
    itemStyle: {
      color: 'hsl(var(--foreground, 0 0% 3.9%))',
    },
  };
}
