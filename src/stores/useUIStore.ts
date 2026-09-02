import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Theme, AnalyticsPeriod, HoldingsView } from '../types/ui';

// ---------------------------------------------------------------------------
// DEVICE PREFERENCES, AND ONLY THOSE.
//
// What is ON SCREEN -- which screen, which month, which span -- lives in the
// address bar (src/app/routes.ts). This store keeps the things that belong to
// the device rather than to the thing being looked at, and that nobody would
// want to impose on the person they send a link to.
//
// A `selectedYearMonth` used to sit here. Nothing read it -- both month
// selectors carried their own -- and now that the month is in the URL it would
// be a second answer to "which month", silently disagreeing with the address.
// It was removed rather than wired up.
// ---------------------------------------------------------------------------
interface UIState {
  theme: Theme;
  sidebarCollapsed: boolean;
  analyticsPeriod: AnalyticsPeriod;
  holdingsView: HoldingsView;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setAnalyticsPeriod: (period: AnalyticsPeriod) => void;
  setHoldingsView: (view: HoldingsView) => void;
}

const systemTheme = (): Theme => {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
};

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      theme: systemTheme(),
      sidebarCollapsed: false,
      analyticsPeriod: '6m',
      // Cash by default: this app is about the forecast, and the forecast is
      // cash. Someone who tracks assets can switch, and the choice sticks.
      holdingsView: 'cash',
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      setAnalyticsPeriod: (analyticsPeriod) => set({ analyticsPeriod }),
      setHoldingsView: (holdingsView) => set({ holdingsView }),
    }),
    {
      name: 'balance-forecast-ui',
      partialize: (state) => ({
        theme: state.theme,
        sidebarCollapsed: state.sidebarCollapsed,
        analyticsPeriod: state.analyticsPeriod,
        holdingsView: state.holdingsView,
      }),
    },
  ),
);
