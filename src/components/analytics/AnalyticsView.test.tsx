import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AnalyticsView from './AnalyticsView';
import { setApi } from '../../lib/api';
import { createMockApi } from '../../test/mock-api';
import { useTemplateStore } from '../../stores/useTemplateStore';
import { useCategoryStore } from '../../stores/useCategoryStore';
import { useMonthlyStore } from '../../stores/useMonthlyStore';
import { useSnapshotStore } from '../../stores/useSnapshotStore';
import { useUIStore } from '../../stores/useUIStore';
import { makeTemplate, monthlyOn } from '../../test/factories';
import type { Category } from '../../types';

// ---------------------------------------------------------------------------
// 分析, now that its span and its drilled-into month live in the address bar.
//
// This screen had no tests at all, and it is the one where the URL work is
// least obvious: the span has TWO sources (the address, and the persisted
// preference behind it), and the month it drills into is the only value here
// that used to be unreachable except by clicking a bar of a chart.
//
// The failure this file exists to catch is the second one. A link keeps working
// while the span it names slides forward -- `?period=6m&month=2026-04` shared in
// September is out of range by January -- and an out-of-range month is not
// merely empty: `useMonthRangeLoaded` fetches only the months in the span, so
// 支出構成 falls back to each entry's DEFAULT amount and states figures the
// household never entered, while 月次比較 beside it says there is no data.
//
// "Today" is pinned, so the span is a known set of months.
// ---------------------------------------------------------------------------

const FIXED_TODAY = new Date(2026, 8, 15); // 2026-09-15

const HOUSING: Category = {
  id: 1,
  name: '住居費',
  type: 'expense',
  color: '#f87171',
  sortOrder: 0,
  costType: 'fixed',
};

const RENT = makeTemplate({
  id: 1,
  name: '家賃',
  type: 'expense',
  categoryId: 1,
  defaultAmount: 100_000,
  recurrence: monthlyOn(27),
});

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(FIXED_TODAY);
  setApi(createMockApi());
  useMonthlyStore.getState().reset();
  useTemplateStore.setState({ templates: [RENT], status: 'ready' });
  useCategoryStore.setState({ categories: [HOUSING], loading: false });
  useSnapshotStore.setState({ snapshots: [] });
  useUIStore.setState({ analyticsPeriod: '6m' });
});

afterEach(() => {
  setApi(null);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('the span', () => {
  it('is read from the address', () => {
    window.history.replaceState(null, '', '/analytics?period=1y');
    render(<AnalyticsView />);

    expect(screen.getByRole('tab', { name: '1年' })).toHaveAttribute('aria-selected', 'true');
  });

  it('falls back to the persisted preference when the address says nothing', () => {
    // The store is not a shadow copy of the URL -- it is where "the span I
    // usually look at" lives, and it only speaks when the address does not.
    useUIStore.setState({ analyticsPeriod: '3m' });
    render(<AnalyticsView />);

    expect(screen.getByRole('tab', { name: '3ヶ月' })).toHaveAttribute('aria-selected', 'true');
  });

  it('ignores a preference that is no longer a span', () => {
    // localStorage has no schema and useUIStore persists without a version, so
    // a value retired in some future release comes back verbatim from a
    // year-old browser. It must not become the state of this screen.
    useUIStore.setState({ analyticsPeriod: '5y' as never });
    render(<AnalyticsView />);

    expect(screen.getByRole('tab', { name: '6ヶ月' })).toHaveAttribute('aria-selected', 'true');
  });

  it('is written to the address, and kept as the preference', async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, '', '/analytics');
    render(<AnalyticsView />);

    await user.click(screen.getByRole('tab', { name: '1年' }));

    // The address, so that a reload and a shared link show the same span...
    expect(window.location.search).toContain('period=1y');
    // ...and the preference, so that arriving at a bare /analytics next week
    // still opens on the span this household actually uses.
    expect(useUIStore.getState().analyticsPeriod).toBe('1y');
  });

  it('clears the drilled-into month when it changes', async () => {
    // A month picked out of a 1-year trend need not exist in a 3-month one.
    const user = userEvent.setup();
    window.history.replaceState(null, '', '/analytics?period=1y&month=2026-01');
    render(<AnalyticsView />);
    expect(screen.getByRole('heading', { name: /支出構成 - 2026年1月/ })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: '3ヶ月' }));

    expect(window.location.search).toBe('?period=3m');
    expect(screen.getByRole('heading', { name: /支出構成 - 2026年9月/ })).toBeInTheDocument();
  });
});

describe('the drilled-into month', () => {
  it('is read from the address when it is inside the span', () => {
    // 6 months back from 2026-09 is 2026-03, so August is in range.
    window.history.replaceState(null, '', '/analytics?period=6m&month=2026-08');
    render(<AnalyticsView />);

    expect(screen.getByRole('heading', { name: /支出構成 - 2026年8月/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /月次比較 - 2026年8月/ })).toBeInTheDocument();
  });

  it('is ignored when the address names a month outside the span', () => {
    // THE REGRESSION GUARD. 2024-04 is nowhere near the 6-month span, so its
    // figures are never fetched. Honouring it would make 支出構成 draw each
    // entry's default amount under a heading naming that month -- a confident
    // statement about money the household never entered -- while 月次比較 next
    // to it says there is no data for the same month.
    window.history.replaceState(null, '', '/analytics?period=6m&month=2024-04');
    render(<AnalyticsView />);

    expect(screen.queryByRole('heading', { name: /2024年4月/ })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /支出構成 - 2026年9月/ })).toBeInTheDocument();
  });

  it('is ignored when the address is malformed', () => {
    window.history.replaceState(null, '', '/analytics?month=banana');
    render(<AnalyticsView />);

    expect(screen.getByRole('heading', { name: /支出構成 - 2026年9月/ })).toBeInTheDocument();
  });
});
