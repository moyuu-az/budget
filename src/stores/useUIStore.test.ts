import { describe, it, expect, beforeEach } from 'vitest';
import { useUIStore } from './useUIStore';

const resetUIStore = (): void => {
  useUIStore.setState({
    theme: 'dark',
    sidebarCollapsed: false,
    analyticsPeriod: '6m',
  });
};

describe('useUIStore', () => {
  beforeEach(() => {
    resetUIStore();
  });

  describe('toggleTheme', () => {
    it('flips dark to light', () => {
      useUIStore.setState({ theme: 'dark' });
      useUIStore.getState().toggleTheme();
      expect(useUIStore.getState().theme).toBe('light');
    });

    it('flips light back to dark', () => {
      useUIStore.setState({ theme: 'light' });
      useUIStore.getState().toggleTheme();
      expect(useUIStore.getState().theme).toBe('dark');
    });

    it('returns to original after two toggles', () => {
      const original = useUIStore.getState().theme;
      useUIStore.getState().toggleTheme();
      useUIStore.getState().toggleTheme();
      expect(useUIStore.getState().theme).toBe(original);
    });
  });

  describe('setTheme', () => {
    it('sets the theme explicitly', () => {
      useUIStore.getState().setTheme('light');
      expect(useUIStore.getState().theme).toBe('light');
    });
  });

  // `shiftMonth` / `setSelectedYearMonth` used to be tested here. The state they
  // moved was read by nothing, and the month on screen now lives in the address
  // bar instead (src/app/routes.ts). The arithmetic itself is still covered, in
  // src/types/ui.test.ts, where shiftYearMonth is.

  describe('toggleSidebar', () => {
    it('collapses an expanded sidebar', () => {
      useUIStore.setState({ sidebarCollapsed: false });
      useUIStore.getState().toggleSidebar();
      expect(useUIStore.getState().sidebarCollapsed).toBe(true);
    });

    it('expands a collapsed sidebar', () => {
      useUIStore.setState({ sidebarCollapsed: true });
      useUIStore.getState().toggleSidebar();
      expect(useUIStore.getState().sidebarCollapsed).toBe(false);
    });
  });

  describe('setSidebarCollapsed', () => {
    it('sets the collapsed flag explicitly', () => {
      useUIStore.getState().setSidebarCollapsed(true);
      expect(useUIStore.getState().sidebarCollapsed).toBe(true);
    });
  });

  describe('setAnalyticsPeriod', () => {
    it('updates the analytics period to 3m', () => {
      useUIStore.getState().setAnalyticsPeriod('3m');
      expect(useUIStore.getState().analyticsPeriod).toBe('3m');
    });

    it('updates the analytics period to 1y', () => {
      useUIStore.getState().setAnalyticsPeriod('1y');
      expect(useUIStore.getState().analyticsPeriod).toBe('1y');
    });
  });
});
