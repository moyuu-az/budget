import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  generateForecast,
  toYearMonth,
  formatCurrency,
  formatYAxisTick,
  formatXAxis,
  summarizeForecastByMonth,
  periodToDays,
  periodToMonths,
} from './forecast';
import type { EntryTemplate, MonthlyAmountsMap } from '../types';

function makeTemplate(overrides: Partial<EntryTemplate> = {}): EntryTemplate {
  return {
    id: 1,
    name: 'Template',
    dayOfMonth: 15,
    type: 'expense',
    enabled: true,
    sortOrder: 0,
    categoryId: null,
    defaultAmount: 1000,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    ...overrides,
  };
}

// Pin "today" to a fixed mid-month date so dayOfMonth math is deterministic.
const FIXED_TODAY = new Date(2026, 5, 4); // 2026-06-04 (month index 5 = June)

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_TODAY);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('toYearMonth', () => {
  it('formats a date as YYYY-MM with zero-padding', () => {
    expect(toYearMonth(new Date(2026, 0, 9))).toBe('2026-01');
    expect(toYearMonth(new Date(2026, 11, 31))).toBe('2026-12');
  });
});

describe('generateForecast', () => {
  it('produces days + 1 points (inclusive of today)', () => {
    const points = generateForecast(10000, [], new Map(), 60);
    expect(points).toHaveLength(61);
    expect(points[0].isToday).toBe(true);
    expect(points[0].balance).toBe(10000);
  });

  it('defaults to a 60-day horizon', () => {
    const points = generateForecast(10000, [], new Map());
    expect(points).toHaveLength(61);
  });

  it('only the first point is marked isToday', () => {
    const points = generateForecast(0, [], new Map(), 10);
    expect(points.filter((p) => p.isToday).length).toBe(1);
    expect(points[0].isToday).toBe(true);
  });

  it('applies an expense on its dayOfMonth for a future day', () => {
    // Today is the 4th; an expense on the 10th hits 6 days out.
    const tpl = makeTemplate({ id: 1, type: 'expense', dayOfMonth: 10, defaultAmount: 5000 });
    const points = generateForecast(100000, [tpl], new Map(), 30);
    const day10 = points.find((p) => p.date.endsWith('-10'));
    expect(day10).toBeDefined();
    expect(day10!.events).toContain('Template');
    expect(day10!.balance).toBe(95000);
    expect(day10!.eventDetails[0]).toMatchObject({ amount: 5000, type: 'expense' });
  });

  it('applies an income on its dayOfMonth for a future day', () => {
    const tpl = makeTemplate({ id: 2, name: 'Salary', type: 'income', dayOfMonth: 25, defaultAmount: 300000 });
    const points = generateForecast(100000, [tpl], new Map(), 40);
    const day25 = points.find((p) => p.date.endsWith('-25'));
    expect(day25).toBeDefined();
    expect(day25!.events).toContain('Salary');
    expect(day25!.balance).toBe(400000);
  });

  it('records an event on today but does NOT change the balance', () => {
    // Today is the 4th; a template on the 4th fires at i=0.
    const tpl = makeTemplate({ id: 3, name: 'TodayBill', type: 'expense', dayOfMonth: 4, defaultAmount: 7000 });
    const points = generateForecast(50000, [tpl], new Map(), 30);
    expect(points[0].events).toContain('TodayBill');
    expect(points[0].balance).toBe(50000);
  });

  it('uses a monthly override amount over the template defaultAmount', () => {
    const tpl = makeTemplate({ id: 4, type: 'expense', dayOfMonth: 10, defaultAmount: 5000 });
    const ym = toYearMonth(new Date(2026, 5, 10));
    const map: MonthlyAmountsMap = new Map([[ym, new Map([[4, 9999]])]]);
    const points = generateForecast(100000, [tpl], map, 30);
    const day10 = points.find((p) => p.date.endsWith('-10'))!;
    expect(day10.balance).toBe(100000 - 9999);
    expect(day10.eventDetails[0].amount).toBe(9999);
  });

  it('excludes disabled templates', () => {
    const tpl = makeTemplate({ id: 5, name: 'Disabled', enabled: false, dayOfMonth: 10, defaultAmount: 5000 });
    const points = generateForecast(100000, [tpl], new Map(), 30);
    const day10 = points.find((p) => p.date.endsWith('-10'))!;
    expect(day10.events).not.toContain('Disabled');
    expect(day10.balance).toBe(100000);
  });

  it('skips a template whose resolved amount is 0', () => {
    const tpl = makeTemplate({ id: 6, name: 'Zero', dayOfMonth: 10, defaultAmount: 0 });
    const points = generateForecast(100000, [tpl], new Map(), 30);
    const day10 = points.find((p) => p.date.endsWith('-10'))!;
    expect(day10.events).toHaveLength(0);
  });

  it('clamps a dayOfMonth beyond the last day to the month end', () => {
    // dayOfMonth 31 in June (30 days) should fire on the 30th.
    const tpl = makeTemplate({ id: 7, name: 'EndOfMonth', type: 'expense', dayOfMonth: 31, defaultAmount: 1000 });
    const points = generateForecast(100000, [tpl], new Map(), 27); // up to 2026-07-01
    const june = points.filter((p) => p.date.startsWith('2026-06') && p.events.includes('EndOfMonth'));
    expect(june.map((p) => p.date)).toEqual(['2026-06-30']);
  });

  it('marks the minimum-balance point excluding today', () => {
    const tpl = makeTemplate({ id: 8, type: 'expense', dayOfMonth: 10, defaultAmount: 20000 });
    const points = generateForecast(30000, [tpl], new Map(), 30);
    const minPoints = points.filter((p) => p.isMinimum);
    expect(minPoints).toHaveLength(1);
    // After the expense on the 10th the balance is the lowest going forward.
    expect(minPoints[0].balance).toBe(10000);
    expect(points[0].isMinimum).toBeUndefined();
  });

  it('does not mark a minimum when there are no future points', () => {
    const points = generateForecast(5000, [], new Map(), 0);
    expect(points).toHaveLength(1);
    expect(points[0].isMinimum).toBeUndefined();
  });
});

describe('formatCurrency', () => {
  it('renders small positive amounts with a yen sign', () => {
    expect(formatCurrency(0)).toBe('¥0');
    expect(formatCurrency(9999)).toBe('¥9,999');
  });

  it('renders amounts >= 10000 in 万 units without decimals when whole', () => {
    expect(formatCurrency(10000)).toBe('1万');
    expect(formatCurrency(50000)).toBe('5万');
  });

  it('renders 万 units with one decimal when not whole', () => {
    expect(formatCurrency(15000)).toBe('1.5万');
  });

  it('uses the 万 branch for large negative amounts', () => {
    expect(formatCurrency(-50000)).toBe('-5万');
  });

  it('uses the yen branch for small negative amounts', () => {
    expect(formatCurrency(-9999)).toBe('¥-9,999');
  });
});

describe('formatYAxisTick', () => {
  it('formats the value in 万 units with no decimals', () => {
    expect(formatYAxisTick(100000)).toBe('10万');
    expect(formatYAxisTick(0)).toBe('0万');
  });
});

describe('formatXAxis', () => {
  it('formats an ISO date as M/D', () => {
    expect(formatXAxis('2026-06-09')).toBe('6/9');
  });
});

describe('summarizeForecastByMonth', () => {
  it('aggregates income, expense, end and min balance per month', () => {
    const points = generateForecast(
      100000,
      [
        makeTemplate({ id: 1, name: 'Pay', type: 'income', dayOfMonth: 25, defaultAmount: 200000 }),
        makeTemplate({ id: 2, name: 'Rent', type: 'expense', dayOfMonth: 10, defaultAmount: 80000 }),
      ],
      new Map(),
      40,
    );
    const summaries = summarizeForecastByMonth(points);
    const june = summaries.find((s) => s.yearMonth === '2026-06');
    expect(june).toBeDefined();
    expect(june!.totalIncome).toBe(200000);
    expect(june!.totalExpense).toBe(80000);
    expect(june!.minBalance).toBeLessThanOrEqual(june!.endBalance);
  });

  it('returns an empty array for no points', () => {
    expect(summarizeForecastByMonth([])).toEqual([]);
  });
});

describe('periodToDays', () => {
  it('maps periods to day counts', () => {
    expect(periodToDays('60d')).toBe(60);
    expect(periodToDays('3m')).toBe(90);
    expect(periodToDays('6m')).toBe(180);
    expect(periodToDays('1y')).toBe(365);
  });
});

describe('periodToMonths', () => {
  it('maps periods to month counts', () => {
    expect(periodToMonths('60d')).toBe(2);
    expect(periodToMonths('3m')).toBe(3);
    expect(periodToMonths('6m')).toBe(6);
    expect(periodToMonths('1y')).toBe(12);
  });
});
