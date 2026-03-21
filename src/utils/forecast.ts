import type { EntryTemplate, MonthlyAmountsMap, MonthSummary, ForecastPoint, ForecastEventDetail } from '../types';
import { resolveAmount } from '../stores/useMonthlyStore';

function getLastDayOfMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function toYearMonth(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function generateForecast(
  currentBalance: number,
  templates: EntryTemplate[],
  monthlyAmountsMap: MonthlyAmountsMap,
  days: number = 60
): ForecastPoint[] {
  const enabledTemplates = templates.filter((t) => t.enabled);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const points: ForecastPoint[] = [];
  let balance = currentBalance;

  for (let i = 0; i <= days; i++) {
    const isToday = i === 0;
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    const dayOfMonth = date.getDate();
    const lastDay = getLastDayOfMonth(date.getFullYear(), date.getMonth());
    const yearMonth = toYearMonth(date);

    const dayEvents: string[] = [];
    const dayEventDetails: ForecastEventDetail[] = [];

    for (const template of enabledTemplates) {
      const effectiveDay = template.dayOfMonth > lastDay ? lastDay : template.dayOfMonth;
      if (dayOfMonth === effectiveDay) {
        const amount = resolveAmount(template.id, yearMonth, monthlyAmountsMap, templates);
        if (amount > 0) {
          // Only apply balance changes for future days, not today
          if (!isToday) {
            if (template.type === 'income') {
              balance += amount;
            } else {
              balance -= amount;
            }
          }
          dayEvents.push(template.name);
          dayEventDetails.push({
            name: template.name,
            amount,
            type: template.type,
            categoryId: template.categoryId,
          });
        }
      }
    }

    points.push({
      date: formatDate(date),
      balance,
      events: dayEvents,
      eventDetails: dayEventDetails,
      isToday,
    });
  }

  // Mark minimum balance point (exclude today at index 0)
  let minIdx = -1;
  let minBal = Infinity;
  for (let i = 1; i < points.length; i++) {
    if (points[i].balance < minBal) {
      minBal = points[i].balance;
      minIdx = i;
    }
  }
  if (minIdx >= 0) {
    points[minIdx].isMinimum = true;
  }

  return points;
}

export function formatCurrency(amount: number): string {
  if (Math.abs(amount) >= 10000) {
    const man = amount / 10000;
    return `${man.toFixed(man % 1 === 0 ? 0 : 1)}万`;
  }
  return `¥${amount.toLocaleString()}`;
}

export function formatYAxisTick(value: number): string {
  return `${(value / 10000).toFixed(0)}万`;
}

export function formatXAxis(dateStr: string): string {
  const date = new Date(dateStr);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

export function summarizeForecastByMonth(points: ForecastPoint[]): MonthSummary[] {
  const monthMap = new Map<string, { points: ForecastPoint[]; income: number; expense: number }>();

  for (const point of points) {
    const ym = point.date.substring(0, 7);
    if (!monthMap.has(ym)) {
      monthMap.set(ym, { points: [], income: 0, expense: 0 });
    }
    const entry = monthMap.get(ym)!;
    entry.points.push(point);
    for (const detail of point.eventDetails) {
      if (detail.type === 'income') {
        entry.income += detail.amount;
      } else {
        entry.expense += detail.amount;
      }
    }
  }

  const summaries: MonthSummary[] = [];
  for (const [yearMonth, data] of monthMap) {
    const balances = data.points.map((p) => p.balance);
    summaries.push({
      yearMonth,
      endBalance: balances[balances.length - 1],
      totalIncome: data.income,
      totalExpense: data.expense,
      minBalance: Math.min(...balances),
    });
  }
  return summaries;
}

export function periodToDays(period: '60d' | '3m' | '6m' | '1y'): number {
  switch (period) {
    case '60d': return 60;
    case '3m': return 90;
    case '6m': return 180;
    case '1y': return 365;
  }
}

export function periodToMonths(period: '60d' | '3m' | '6m' | '1y'): number {
  switch (period) {
    case '60d': return 2;
    case '3m': return 3;
    case '6m': return 6;
    case '1y': return 12;
  }
}
