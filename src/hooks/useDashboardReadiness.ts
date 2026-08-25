import { useCallback, useEffect, useMemo } from 'react';
import { useForecast } from './useForecast';
import { monthsInRange, rangeStatusOf, useMonthlyStore } from '../stores/useMonthlyStore';
import { useSettingsStore } from '../stores/useSettingsStore';
import { combineStatus, type LoadStatus } from '../stores/load-status';
import { loadLedgerData } from '../app/ledger';
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
//
// AND IT FETCHES WHAT IT WAITS FOR
//   The first version only OBSERVED the months, leaving DashboardView to fetch
//   them -- and the two immediately disagreed. The view asked for its selected
//   60-day period; the KPI row waits on 90. The extra month was fetched by
//   nobody, so the KPI row spun forever on the default view, and the tests
//   missed it because their helper marked 90 days ready by hand.
//
//   Whatever decides what to WAIT FOR has to be what ASKS for it. Then they
//   cannot drift, and no test helper can paper over the gap.
// ---------------------------------------------------------------------------

export interface DashboardReadiness {
  status: LoadStatus;
  /** The projection, empty unless `status` is 'ready'. */
  points: ForecastPoint[];
  /**
   * Re-runs everything this readiness depends on.
   *
   * Passed to LoadGate, because its default retry (`loadLedgerData`) does NOT
   * include the per-month amounts -- which are exactly the thing most likely to
   * have failed here. Without it the button re-fetches everything except what
   * broke and leaves the error on screen.
   */
  retry: () => Promise<void>;
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

  const fetchRange = useMonthlyStore((s) => s.fetchMonthlyAmountsRange);
  const start = months[0];
  const end = months[months.length - 1];

  useEffect(() => {
    void fetchRange(start, end);
  }, [fetchRange, start, end]);

  // `force`, because after a failure the months are marked 'error' and the
  // ordinary call would still have to decide whether to try again. Pressing
  // 再読み込み is that decision.
  const retry = useCallback(async () => {
    await Promise.all([loadLedgerData(), fetchRange(start, end, true)]);
  }, [fetchRange, start, end]);

  const amountsStatus = rangeStatusOf(monthStatus, months, 'amounts');
  const status = combineStatus(forecastStatus, settingsStatus, amountsStatus);

  return useMemo(
    () => ({ status, points: status === 'ready' ? points : [], retry }),
    [status, points, retry],
  );
}
