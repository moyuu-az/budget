import { useCallback, useEffect, useMemo } from 'react';
import { useSessionStore } from '../stores/useSessionStore';
import {
  halfStatusOf, monthStatusOf, monthsInRange, rangeStatusOf, useMonthlyStore,
} from '../stores/useMonthlyStore';
import { combineStatus, type LoadStatus } from '../stores/load-status';

// ---------------------------------------------------------------------------
// "Make sure this month's figures are loaded, for the ledger that is open now."
//
// WHY THIS IS ONE HOOK AND NOT AN EFFECT IN EACH PANEL
//
// Three panels needed the same thing and each wrote its own effect, and all
// three had the same hole. Switching ledgers calls resetLedgerData(), which
// empties monthStatus, and loadLedgerData() deliberately does NOT refetch
// months -- they are fetched as the user navigates. So after a switch the
// status map knows nothing about any month.
//
// An effect whose dependencies are `[yearMonth, <store actions>]` does not
// re-run at that point: the month has not changed, and a Zustand action is a
// stable reference. Meanwhile monthStatusOf reports an unknown month as
// 'loading' -- correctly, since nobody has asked for it -- so the panel's gate
// closes and never opens. 今月のサマリー sits in the sidebar of every screen,
// which makes that a spinner across the whole application until the user
// happens to open 収支管理.
//
// The dependency that was missing is the LEDGER. It lives in this file once --
// twice, strictly: a single month and a range of them are two different fetches,
// so there are two hooks. Between them they are the ONLY places in the
// application that load per-month figures, and a panel added later gets the
// ledger by using one of them rather than by remembering.
//
// (SettingsView solves the same problem for MinBalanceSetting with
// `key={activeLedgerId}`, remounting the component. That works, but it is a
// per-component remedy -- and a remedy that has to be repeated is a hole
// waiting for the next component that forgets it.)
// ---------------------------------------------------------------------------

interface Options {
  /**
   * Whether the caller needs the recorded actuals as well as the plan.
   *
   * Default true. Pass false for a panel that reads only planned figures --
   * waiting on actuals it never asked for would leave it loading forever, which
   * is why SankeyChart gates on the amounts half alone.
   */
  actuals?: boolean;
}

export interface MonthLoad {
  /** 'ready' only once every half this caller asked for has arrived. */
  status: LoadStatus;
  /**
   * Re-runs the fetch unconditionally.
   *
   * For a retry button: the month is marked 'error', and the caller asking
   * again means "try anyway". Forcing also covers the case where the figures
   * are 'ready' but known to be stale -- a write that partially failed.
   */
  retry: () => Promise<void>;
}

export function useMonthLoaded(yearMonth: string, options: Options = {}): MonthLoad {
  const { actuals = true } = options;

  // Read for its IDENTITY, not its value: nothing below uses the number. It is
  // in the dependency list because "which ledger these figures belong to" is
  // part of what the effect is fetching, and leaving it out is the bug above.
  const activeLedgerId = useSessionStore((s) => s.activeLedgerId);

  const monthStatus = useMonthlyStore((s) => s.monthStatus);
  const fetchMonthlyAmounts = useMonthlyStore((s) => s.fetchMonthlyAmounts);
  const fetchMonthlyActuals = useMonthlyStore((s) => s.fetchMonthlyActuals);

  const load = useCallback(
    async (force: boolean) => {
      // In parallel: they are two independent requests and a panel that needs
      // both is waiting on the slower one either way.
      await Promise.all([
        fetchMonthlyAmounts(yearMonth, force),
        actuals ? fetchMonthlyActuals(yearMonth, force) : Promise.resolve(),
      ]);
    },
    [yearMonth, actuals, fetchMonthlyAmounts, fetchMonthlyActuals],
  );

  useEffect(() => {
    // Not forced. The store skips a month already loaded or in flight, which is
    // what lets two copies of the same panel -- the sidebar summary is rendered
    // twice, once per shell -- ask for the same month without sending the same
    // request twice.
    void load(false);
  }, [load, activeLedgerId]);

  const retry = useCallback(() => load(true), [load]);

  return {
    status: actuals
      ? monthStatusOf(monthStatus, yearMonth)
      : halfStatusOf(monthStatus, yearMonth, 'amounts'),
    retry,
  };
}

/**
 * The same guarantee for a RANGE of months.
 *
 * Separate from useMonthLoaded rather than folded into it because the fetches
 * are different endpoints, not the same one in a loop -- one request for the
 * whole span is the point of them.
 *
 * `actualsEndMonth` is optional and, when given, loads the recorded actuals for
 * `startMonth`..`actualsEndMonth`. It is a separate end because the two spans
 * genuinely differ: 分析 plots planned figures into the FUTURE and actuals only
 * up to today, and asking for actuals nobody records for next March would leave
 * the view waiting forever.
 *
 * Scalars rather than a tuple, so the dependency lists compare by value. A
 * `[start, end]` array built inline is a new identity on every render, which
 * would re-run the effect every time and lean on deduplication to stay quiet.
 */
export function useMonthRangeLoaded(
  startMonth: string,
  endMonth: string,
  actualsEndMonth?: string,
): MonthLoad {
  const activeLedgerId = useSessionStore((s) => s.activeLedgerId);

  const monthStatus = useMonthlyStore((s) => s.monthStatus);
  const fetchAmounts = useMonthlyStore((s) => s.fetchMonthlyAmountsRange);
  const fetchActuals = useMonthlyStore((s) => s.fetchActualsRange);

  const load = useCallback(
    async (force: boolean) => {
      await Promise.all([
        fetchAmounts(startMonth, endMonth, force),
        actualsEndMonth === undefined
          ? Promise.resolve()
          : fetchActuals(startMonth, actualsEndMonth, force),
      ]);
    },
    [startMonth, endMonth, actualsEndMonth, fetchAmounts, fetchActuals],
  );

  useEffect(() => {
    void load(false);
  }, [load, activeLedgerId]);

  const retry = useCallback(() => load(true), [load]);

  const months = useMemo(() => monthsInRange(startMonth, endMonth), [startMonth, endMonth]);
  const actualMonths = useMemo(
    () => (actualsEndMonth === undefined ? [] : monthsInRange(startMonth, actualsEndMonth)),
    [startMonth, actualsEndMonth],
  );

  return {
    status: combineStatus(
      rangeStatusOf(monthStatus, months, 'amounts'),
      rangeStatusOf(monthStatus, actualMonths, 'actuals'),
    ),
    retry,
  };
}
