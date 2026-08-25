import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import MonthlySummary from './MonthlySummary';
import { useTemplateStore } from '../../stores/useTemplateStore';
import { useMonthlyStore } from '../../stores/useMonthlyStore';
import { makeTemplate, monthlyOn, onceOn, yearlyOn } from '../../test/factories';

// ---------------------------------------------------------------------------
// 今月のサマリー sits in the sidebar, which is on screen on EVERY view. That
// makes it the most-seen figure in the application -- and therefore the worst
// place for the recurrence mistake this file exists to prevent: an annual
// premium is enabled all twelve months and belongs to one of them, so summing
// every enabled entry would show 車検 twelve times a year, everywhere.
//
// It was the sixth aggregation site, and the one the first pass missed.
// ---------------------------------------------------------------------------

const FIXED_TODAY = new Date(2026, 5, 4); // 2026-06-04

const RENT = makeTemplate({ id: 1, name: '家賃', type: 'expense', defaultAmount: 100_000, recurrence: monthlyOn(27) });
const SALARY = makeTemplate({ id: 2, name: '給料', type: 'income', defaultAmount: 300_000, recurrence: monthlyOn(25) });

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(FIXED_TODAY);
  useMonthlyStore.setState({ monthlyAmountsMap: new Map(), monthlyActualsMap: new Map() });
});

afterEach(() => {
  vi.useRealTimers();
});

/** The figure beside a label, as a number. */
function figure(label: string): number {
  const row = screen.getByText(label).parentElement!;
  return Number((row.textContent ?? '').replace(/[^0-9]/g, ''));
}

describe('this month’s summary', () => {
  it('sums the entries that fall in this month', () => {
    useTemplateStore.setState({ templates: [RENT, SALARY], status: 'ready' });
    render(<MonthlySummary />);

    expect(figure('収入')).toBe(300_000);
    expect(figure('支出')).toBe(100_000);
    expect(figure('差引')).toBe(200_000);
  });

  it('excludes an annual entry from the eleven months it skips', () => {
    const inspection = makeTemplate({
      id: 3, name: '車検', type: 'expense', defaultAmount: 120_000, recurrence: yearlyOn(9, 12),
    });
    useTemplateStore.setState({ templates: [RENT, inspection], status: 'ready' });
    render(<MonthlySummary />);

    expect(figure('支出')).toBe(100_000);
  });

  it('includes it in the month it does fall in', () => {
    const premium = makeTemplate({
      id: 4, name: '年払い保険', type: 'expense', defaultAmount: 60_000, recurrence: yearlyOn(6, 1),
    });
    useTemplateStore.setState({ templates: [RENT, premium], status: 'ready' });
    render(<MonthlySummary />);

    expect(figure('支出')).toBe(160_000);
  });

  it('never counts a one-off dated in another month', () => {
    const trip = makeTemplate({
      id: 5, name: '旅行', type: 'expense', defaultAmount: 200_000, recurrence: onceOn('2026-11-20'),
    });
    useTemplateStore.setState({ templates: [RENT, trip], status: 'ready' });
    render(<MonthlySummary />);

    expect(figure('支出')).toBe(100_000);
  });

  it('still excludes disabled entries', () => {
    useTemplateStore.setState({
      templates: [RENT, { ...SALARY, enabled: false }],
      status: 'ready',
    });
    render(<MonthlySummary />);

    expect(figure('収入')).toBe(0);
  });

  it('says it is loading rather than showing ¥0 as a figure', () => {
    // 「収入 +¥0 / 支出 -¥0」 reads as a month with nothing in it, not as a panel
    // still waiting for its data.
    useTemplateStore.setState({ templates: [], status: 'loading' });
    render(<MonthlySummary />);

    expect(screen.getByRole('status')).toHaveTextContent('今月のサマリーを読み込み中');
  });
});
