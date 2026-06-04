import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Theme, AnalyticsPeriod } from '../types/ui';
import { shiftYearMonth } from '../types/ui';
import { toYearMonth } from '../utils/forecast';

interface UIState {
  theme: Theme;
  selectedYearMonth: string;
  sidebarCollapsed: boolean;
  analyticsPeriod: AnalyticsPeriod;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  setSelectedYearMonth: (ym: string) => void;
  shiftMonth: (delta: number) => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setAnalyticsPeriod: (period: AnalyticsPeriod) => void;
}

const systemTheme = (): Theme => {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
};

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      theme: systemTheme(),
      selectedYearMonth: toYearMonth(new Date()),
      sidebarCollapsed: false,
      analyticsPeriod: '6m',
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
      setSelectedYearMonth: (selectedYearMonth) => set({ selectedYearMonth }),
      shiftMonth: (delta) =>
        set((s) => ({ selectedYearMonth: shiftYearMonth(s.selectedYearMonth, delta) })),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      setAnalyticsPeriod: (analyticsPeriod) => set({ analyticsPeriod }),
    }),
    {
      name: 'balance-forecast-ui',
      partialize: (state) => ({
        theme: state.theme,
        sidebarCollapsed: state.sidebarCollapsed,
        analyticsPeriod: state.analyticsPeriod,
      }),
    },
  ),
);
