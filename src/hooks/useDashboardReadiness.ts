import { useMemo } from 'react';
import { useForecast } from './useForecast';
import { monthsInRange, rangeStatusOf, useMonthlyStore } from '../stores/useMonthlyStore';
import { useSettingsStore } from '../stores/useSettingsStore';
import { combineStatus, type LoadStatus } from '../stores/load-status';
import { toYearMonth } from '../utils/forecast';
import type { ForecastPoint } from '../types';

// ---------------------------------------------------------------------------
// ONE READINESS FOR THE WHOLE DASHBOARD.
//
// WHY THIS EXISTS RATHER THAN A STATUS PER PANEL
//   Every panel here states something about money, and the inputs are shared.
//   Gating each one on whichever inputs it happens to read produced exactly the
//   contradiction it was supposed to prevent: the KPI row waited for the
//   household's floor while the chart directly below it drew a reference line at
//   the DEFAULT floor and coloured its minimum point green -- two answers to one
//   question, on one screen, one of them reassuring and wrong.
//
//   Three separate near-misses had the same shape (the settings' status, last
//   month's fetch, the forecast range's fetch), each fixed by folding one more
//   status into one more place. That is guard accumulation: the gaps grow with
//   the guards. So readiness is decided ONCE, here, and every panel gates on the
//   same answer.
//
// WHAT IT WAITS FOR
//   - the balance and the templates (via useForecast: the projection itself)
//   - the ledger's SETTINGS, because every 安全/注意 judgement and 使っていい額
//     is measured against the floor, and the default is only known to be right
//     once the server has confirmed nothing was configured
//   - the per-month PLANNED AMOUNTS across the projected range, because a month
//     whose override never arrived is read at its template default -- a ¥500,000
//     rent seen as ¥100,000, and the screen calls the result 余裕
//
//   NOT the recorded actuals: nothing on the forecast side reads them, and
//   waiting for months ahead that nobody fetches actuals for would leave the
//   whole dashboard loading forever. 先月の予実 has its own gate for that.
// ---------------------------------------------------------------------------

export interface DashboardReadiness {
  status: LoadStatus;
  /** The projection, empty unless `status` is 'ready'. */
  points: ForecastPoint[];
}

export function useDashboardReadiness(days: number): DashboardReadiness {
  const { status: forecastStatus, points } = useForecast(days);
  const settingsStatus = useSettingsStore((s) => s.status);
  const monthStatus = useMonthlyStore((s) => s.monthStatus);

  // The months the projection spans. Derived from `days` rather than from the
  // points, because the points are EMPTY until the forecast is ready -- reading
  // them would make this vacuously ready at exactly the moment it matters.
  const months = useMemo(() => {
    const today = new Date();
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + days);
    return monthsInRange(toYearMonth(today), toYearMonth(end));
  }, [days]);

  const amountsStatus = rangeStatusOf(monthStatus, months, 'amounts');
  const status = combineStatus(forecastStatus, settingsStatus, amountsStatus);

  return useMemo(
    () => ({ status, points: status === 'ready' ? points : [] }),
    [status, points],
  );
}
