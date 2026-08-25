import { useMemo } from 'react';
import { useForecast } from './useForecast';
import { toYearMonth } from '../utils/forecast';
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
   * False until the forecast's inputs have arrived.
   *
   * Every figure above is zero while this is false, and zero is not a reading --
   * `minBalance90d: 0` next to a 「注意」 badge is exactly the fabricated warning
   * useForecast exists to prevent. Render a loading state, not the numbers.
   */
  ready: boolean;
}

const KPI_HORIZON_DAYS = 90;
const LARGE_EXPENSE_HORIZON_DAYS = 60;

function daysBetween(fromMidnight: Date, dateStr: string): number {
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - fromMidnight.getTime()) / (1000 * 60 * 60 * 24));
}

function computeKpis(points: ForecastPoint[]): DashboardKpis {
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
    // Overwritten by the caller; computeKpis has no opinion about loading.
    ready: true,
  };
}

export function useDashboardKpis(): DashboardKpis {
  // Same projection as the chart, just a fixed horizon -- see useForecast for
  // why there is only one place that builds it, and why it reports readiness.
  const { ready, points } = useForecast(KPI_HORIZON_DAYS);
  return useMemo(() => ({ ...computeKpis(points), ready }), [points, ready]);
}
