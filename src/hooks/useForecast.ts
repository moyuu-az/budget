import { useMemo } from 'react';
import type { EntryTemplate, MonthlyAmountsMap, ForecastPoint } from '../types';
import { generateForecast } from '../utils/forecast';

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
    return forecast
      .slice(0, 14)
      .filter((p) => p.events.length > 0)
      .map((p) => ({
        date: p.date,
        events: p.events,
        balanceAfter: p.balance
      }));
  }, [forecast]);

  return { forecast, minimumPoint, upcomingEvents };
}
