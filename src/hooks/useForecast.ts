import { useMemo } from 'react';
import type { EntryTemplate, MonthlyAmountsMap, ForecastPoint } from '../types';
import { generateForecast } from '../utils/forecast';

export interface UpcomingEvent {
  date: string;
  name: string;
  amount: number;
  type: 'income' | 'expense';
  balanceAfter: number;
}

export function useForecast(
  balance: number,
  templates: EntryTemplate[],
  monthlyAmountsMap: MonthlyAmountsMap,
  days: number = 60
) {
  const forecast = useMemo(() => {
    return generateForecast(balance, templates, monthlyAmountsMap, days);
  }, [balance, templates, monthlyAmountsMap, days]);

  const minimumPoint = useMemo(() => {
    return forecast.find((p) => p.isMinimum) ?? null;
  }, [forecast]);

  const upcomingEvents = useMemo(() => {
    const events: UpcomingEvent[] = [];
    let runningBalance = balance;

    for (const point of forecast.slice(0, 14)) {
      for (const detail of point.eventDetails) {
        if (detail.type === 'income') {
          runningBalance += detail.amount;
        } else {
          runningBalance -= detail.amount;
        }
        events.push({
          date: point.date,
          name: detail.name,
          amount: detail.amount,
          type: detail.type,
          balanceAfter: runningBalance,
        });
      }
    }

    return events;
  }, [forecast, balance]);

  return { forecast, minimumPoint, upcomingEvents };
}
