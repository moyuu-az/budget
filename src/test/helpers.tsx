import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';
import { monthsInRange, useMonthlyStore } from '../stores/useMonthlyStore';
import { toYearMonth } from '../utils/forecast';

// Zustand stores are accessed directly via hooks (no Context), so providers stay minimal.
export const renderWithProviders = (ui: ReactElement, options?: RenderOptions): RenderResult => {
  return render(ui, options);
};

// ---------------------------------------------------------------------------
// Seeding the dashboard's readiness.
//
// The dashboard waits for FOUR things, and three of them are easy to forget in a
// test: the balance, the templates, the ledger's settings, and the per-month
// planned amounts across the projected range. A test that seeds only the first
// two sees a permanently-loading screen and reads it as a regression.
//
// The helper exists so that "everything has arrived" is one call rather than
// four setState blocks copied between files -- which is how the four drift into
// meaning something slightly different in each.
// ---------------------------------------------------------------------------

/**
 * Marks every month the projection spans as fetched.
 *
 * `days` must match the horizon the component under test asks for: KpiHero uses
 * 90, DashboardView uses whatever its period selector says (60 by default).
 * Over-covering is harmless, so a test that is unsure should pass the larger.
 */
export const markForecastMonthsFetched = (days: number, today = new Date()): void => {
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + days);
  const months = monthsInRange(toYearMonth(today), toYearMonth(end));
  const monthStatus = new Map(useMonthlyStore.getState().monthStatus);
  for (const month of months) {
    monthStatus.set(month, { ...(monthStatus.get(month) ?? { amounts: 'idle', actuals: 'idle' }), amounts: 'ready' });
  }
  useMonthlyStore.setState({ monthStatus });
};
