import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Theme } from '../types/ui';
import { shiftYearMonth } from '../types/ui';
import { toYearMonth } from '../utils/forecast';

interface UIState {
  theme: Theme;
  selectedYearMonth: string;
  sidebarCollapsed: boolean;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  setSelectedYearMonth: (ym: string) => void;
  shiftMonth: (delta: number) => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
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
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
      setSelectedYearMonth: (selectedYearMonth) => set({ selectedYearMonth }),
      shiftMonth: (delta) =>
        set((s) => ({ selectedYearMonth: shiftYearMonth(s.selectedYearMonth, delta) })),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
    }),
    {
      name: 'balance-forecast-ui',
      partialize: (state) => ({
        theme: state.theme,
        sidebarCollapsed: state.sidebarCollapsed,
      }),
    },
  ),
);
