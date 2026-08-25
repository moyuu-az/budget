import { useMemo } from 'react';
import { useDashboardReadiness } from './useDashboardReadiness';
import type { LoadStatus } from '../stores/load-status';
import { toYearMonth } from '../utils/forecast';
import { runway, safeToSpend, type Runway, type SafeToSpend } from '../utils/runway';
import { useSettingsStore } from '../stores/useSettingsStore';
import type { ForecastPoint } from '../types';

export interface NextLargeExpense {
  name: string;
  amount: number;
  date: string;
  daysUntil: number;
}

export interface DashboardKpis {
  /** Net income - expense for the current calendar month (forecast events). */
  thisMonthNet: number;
  /** Lowest projected balance within the next 90 days (excludes today). */
  minBalance90d: number;
  /** Date string (YYYY-MM-DD) of the 90-day minimum, or null when unavailable. */
  minBalance90dDate: string | null;
  /** Largest single expense event occurring within the next 60 days, or null. */
  nextLargeExpense: NextLargeExpense | null;
  /** Average projected balance change per day over the 90-day window. */
  forecastSlopePerDay: number;
  /**
   * What is free to spend before the next income arrives.
   *
   * The figure this dashboard was missing. 「90日後の最小残高 ¥120,000」 is true
   * and unactionable; 「次の給料まで12日、自由に使えるのは ¥48,000」 is the same
   * projection asked as a question the household can answer today.
   */
  safeToSpend: SafeToSpend;
  /**
   * When the projection first falls below the household's floor, or null.
   *
   * Null means "not within the 90-day window", NOT "never" -- a caller must say
   * 「90日以内には割りません」 rather than 「割りません」.
   */
  runway: Runway | null;
  /** The floor those two are measured against, so a caller can name it. */
  minBalanceThreshold: number;
  /**
   * Where the forecast's inputs have got to.
   *
   * Every figure above is zero unless this is 'ready', and zero is not a reading
   * -- `minBalance90d: 0` next to a 「注意」 badge is exactly the fabricated
   * warning useForecast exists to prevent. Render the state, not the numbers.
   */
  status: LoadStatus;
}

const KPI_HORIZON_DAYS = 90;
const LARGE_EXPENSE_HORIZON_DAYS = 60;

function daysBetween(fromMidnight: Date, dateStr: string): number {
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - fromMidnight.getTime()) / (1000 * 60 * 60 * 24));
}

function computeKpis(points: ForecastPoint[], threshold: number): DashboardKpis {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const currentMonth = toYearMonth(today);

  let thisMonthNet = 0;
  let minBalance90d = Infinity;
  let minBalance90dDate: string | null = null;
  let nextLargeExpense: NextLargeExpense | null = null;

  for (const point of points) {
    if (point.date.startsWith(currentMonth)) {
      for (const detail of point.eventDetails) {
        thisMonthNet += detail.type === 'income' ? detail.amount : -detail.amount;
      }
    }

    if (!point.isToday && point.balance < minBalance90d) {
      minBalance90d = point.balance;
      minBalance90dDate = point.date;
    }

    if (point.isToday) continue;
    const daysUntil = daysBetween(today, point.date);
    if (daysUntil > LARGE_EXPENSE_HORIZON_DAYS) continue;
    for (const detail of point.eventDetails) {
      if (detail.type !== 'expense') continue;
      if (!nextLargeExpense || detail.amount > nextLargeExpense.amount) {
        nextLargeExpense = {
          name: detail.name,
          amount: detail.amount,
          date: point.date,
          daysUntil,
        };
      }
    }
  }

  const startBalance = points[0]?.balance ?? 0;
  const endBalance = points[points.length - 1]?.balance ?? startBalance;
  const span = Math.max(points.length - 1, 1);
  const forecastSlopePerDay = (endBalance - startBalance) / span;

  return {
    thisMonthNet,
    minBalance90d: minBalance90d === Infinity ? startBalance : minBalance90d,
    minBalance90dDate,
    nextLargeExpense,
    forecastSlopePerDay,
    // Both read the SAME points this function already walked, rather than
    // rebuilding a projection: two projections would be two answers to "when
    // does the rent leave". See useForecast for why there is exactly one.
    safeToSpend: safeToSpend(points, threshold),
    runway: runway(points, threshold),
    minBalanceThreshold: threshold,
    // Overwritten by the caller; computeKpis has no opinion about loading.
    status: 'ready',
  };
}

export function useDashboardKpis(): DashboardKpis {
  // The SAME readiness and the SAME projection every other panel on this screen
  // uses -- see useDashboardReadiness for why that is decided in one place
  // rather than per panel.
  const { status, points } = useDashboardReadiness(KPI_HORIZON_DAYS);

  // The household's own floor, not a constant. 50,000 was hard-coded here, which
  // made 「安全」 mean the same thing for every household. Safe to read without
  // checking its status: `status` above already includes it.
  const threshold = useSettingsStore((s) => s.settings.minBalanceThreshold);

  return useMemo(
    () => ({ ...computeKpis(points, threshold), status }),
    [points, threshold, status],
  );
}
