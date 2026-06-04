import { describe, it, expect, beforeEach } from 'vitest';
import { useUIStore } from './useUIStore';

const resetUIStore = (): void => {
  useUIStore.setState({
    theme: 'dark',
    selectedYearMonth: '2026-06',
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

  describe('shiftMonth', () => {
    it('moves forward one month within the same year', () => {
      useUIStore.setState({ selectedYearMonth: '2026-06' });
      useUIStore.getState().shiftMonth(1);
      expect(useUIStore.getState().selectedYearMonth).toBe('2026-07');
    });

    it('moves forward across a year boundary', () => {
      useUIStore.setState({ selectedYearMonth: '2026-12' });
      useUIStore.getState().shiftMonth(1);
      expect(useUIStore.getState().selectedYearMonth).toBe('2027-01');
    });

    it('moves backward across a year boundary', () => {
      useUIStore.setState({ selectedYearMonth: '2026-01' });
      useUIStore.getState().shiftMonth(-1);
      expect(useUIStore.getState().selectedYearMonth).toBe('2025-12');
    });

    it('moves backward several months within the same year', () => {
      useUIStore.setState({ selectedYearMonth: '2026-06' });
      useUIStore.getState().shiftMonth(-3);
      expect(useUIStore.getState().selectedYearMonth).toBe('2026-03');
    });

    it('pads single-digit months with a leading zero', () => {
      useUIStore.setState({ selectedYearMonth: '2026-12' });
      useUIStore.getState().shiftMonth(2);
      expect(useUIStore.getState().selectedYearMonth).toBe('2027-02');
    });
  });

  describe('setSelectedYearMonth', () => {
    it('sets the selected year-month directly', () => {
      useUIStore.getState().setSelectedYearMonth('2025-09');
      expect(useUIStore.getState().selectedYearMonth).toBe('2025-09');
    });
  });

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
