export const lightColors = {
  'surface-base': '#F8FAFC',
  'surface-raised': '#FFFFFF',
  'surface-overlay': 'rgba(255, 255, 255, 0.95)',
  'surface-inverse': '#0F172A',
  'content-primary': '#0F172A',
  'content-secondary': '#334155',
  'content-muted': '#64748B',
  'content-disabled': '#CBD5E1',
  'content-inverse': '#F8FAFC',
  'accent-primary': '#4F46E5',
  'accent-secondary': '#7C3AED',
  'semantic-success': '#16A34A',
  'semantic-warning': '#D97706',
  'semantic-danger': '#DC2626',
  'semantic-info': '#0284C7',
  'chart-income': '#16A34A',
  'chart-expense': '#DC2626',
  'chart-balance': '#4F46E5',
  'chart-forecast': '#7C3AED',
  'border-subtle': 'rgba(15, 23, 42, 0.08)',
  'border-strong': 'rgba(15, 23, 42, 0.16)',
  'border-focus': '#4F46E5',
} as const;

export const darkColors = {
  'surface-base': '#141A2E',
  'surface-raised': 'rgba(30, 41, 72, 0.6)',
  'surface-overlay': 'rgba(30, 41, 72, 0.8)',
  'surface-inverse': '#F8FAFC',
  'content-primary': '#E2E8F0',
  'content-secondary': '#CBD5E1',
  'content-muted': '#94A3B8',
  'content-disabled': '#475569',
  'content-inverse': '#0F172A',
  'accent-primary': '#818CF8',
  'accent-secondary': '#A78BFA',
  'semantic-success': '#22C55E',
  'semantic-warning': '#F59E0B',
  'semantic-danger': '#EF4444',
  'semantic-info': '#38BDF8',
  'chart-income': '#22C55E',
  'chart-expense': '#EF4444',
  'chart-balance': '#60A5FA',
  'chart-forecast': '#A78BFA',
  'border-subtle': 'rgba(100, 116, 170, 0.15)',
  'border-strong': 'rgba(100, 116, 170, 0.3)',
  'border-focus': '#818CF8',
} as const;

export const chartSeries = [
  '#4F46E5', '#22C55E', '#F59E0B', '#EF4444',
  '#06B6D4', '#EC4899', '#8B5CF6', '#14B8A6',
] as const;

export const radii = {
  sm: '6px',
  md: '10px',
  lg: '14px',
  xl: '20px',
  pill: '999px',
  full: '9999px',
} as const;

export const shadows = {
  sm: '0 1px 2px rgba(15, 23, 42, 0.08)',
  md: '0 4px 12px rgba(15, 23, 42, 0.10)',
  lg: '0 12px 32px rgba(15, 23, 42, 0.14)',
  'glow-blue': '0 0 20px rgba(79, 70, 229, 0.15), 0 0 40px rgba(79, 70, 229, 0.05)',
  'glow-green': '0 0 20px rgba(34, 197, 94, 0.15), 0 0 40px rgba(34, 197, 94, 0.05)',
  'glow-red': '0 0 20px rgba(239, 68, 68, 0.15), 0 0 40px rgba(239, 68, 68, 0.05)',
  'glow-purple': '0 0 20px rgba(139, 92, 246, 0.15), 0 0 40px rgba(139, 92, 246, 0.05)',
} as const;

export const motionDurations = {
  fast: '120ms',
  base: '200ms',
  slow: '320ms',
} as const;

export const motionEasings = {
  standard: 'cubic-bezier(0.2, 0, 0, 1)',
  emphasized: 'cubic-bezier(0.3, 0, 0, 1)',
  decelerate: 'cubic-bezier(0, 0, 0, 1)',
} as const;

export type ThemeColors = typeof lightColors;
export type ThemeName = 'light' | 'dark';
