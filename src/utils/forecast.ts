import type { EntryTemplate, MonthlyAmountsMap, ForecastPoint, ForecastEventDetail } from '../types';

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
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    const dayOfMonth = date.getDate();
    const lastDay = getLastDayOfMonth(date.getFullYear(), date.getMonth());
    const yearMonth = toYearMonth(date);

    const monthAmounts = monthlyAmountsMap.get(yearMonth);
    const dayEvents: string[] = [];
    const dayEventDetails: ForecastEventDetail[] = [];

    for (const template of enabledTemplates) {
      const effectiveDay = template.dayOfMonth > lastDay ? lastDay : template.dayOfMonth;
      if (dayOfMonth === effectiveDay) {
        const amount = monthAmounts?.get(template.id) ?? 0;
        if (amount > 0) {
          if (template.type === 'income') {
            balance += amount;
          } else {
            balance -= amount;
          }
          dayEvents.push(template.name);
          dayEventDetails.push({
            name: template.name,
            amount,
            type: template.type,
          });
        }
      }
    }

    points.push({
      date: formatDate(date),
      balance,
      events: dayEvents,
      eventDetails: dayEventDetails,
    });
  }

  let minIdx = 0;
  for (let i = 1; i < points.length; i++) {
    if (points[i].balance < points[minIdx].balance) {
      minIdx = i;
    }
  }
  if (points.length > 0) {
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
