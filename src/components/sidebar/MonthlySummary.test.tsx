import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MonthlySummary from './MonthlySummary';
import { useTemplateStore } from '../../stores/useTemplateStore';
import { useMonthlyStore } from '../../stores/useMonthlyStore';
import { useSessionStore } from '../../stores/useSessionStore';
import { switchLedger } from '../../app/ledger';
import { setApi } from '../../lib/api';
import { createMockApi } from '../../test/mock-api';
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
  setApi(createMockApi());
  useMonthlyStore.getState().reset();
  useSessionStore.setState({
    session: {
      user: { id: 1, email: 'a@example.com', displayName: 'A' },
      ledgers: [
        { id: 1, slug: 'household', name: '家計', kind: 'shared' },
        { id: 2, slug: 'private', name: '個人', kind: 'personal' },
      ],
    },
    activeLedgerId: 1,
  });
});

afterEach(() => {
  setApi(null);
  vi.useRealTimers();
});

// The panel now fetches its own month, so every assertion about a figure has to
// wait for it. That fetch is the point: reading the map alone left the sidebar
// showing template defaults until 収支管理 was opened, and then silently
// changing.
const settled = async (): Promise<void> => {
  await screen.findByText('今月のサマリー');
};

/** The figure beside a label, as a number. */
function figure(label: string): number {
  const row = screen.getByText(label).parentElement!;
  return Number((row.textContent ?? '').replace(/[^0-9]/g, ''));
}

describe('this month’s summary', () => {
  it('sums the entries that fall in this month', async () => {
    useTemplateStore.setState({ templates: [RENT, SALARY], status: 'ready' });
    render(<MonthlySummary />);
    await settled();

    expect(figure('収入')).toBe(300_000);
    expect(figure('支出')).toBe(100_000);
    expect(figure('差引')).toBe(200_000);
  });

  it('excludes an annual entry from the eleven months it skips', async () => {
    const inspection = makeTemplate({
      id: 3, name: '車検', type: 'expense', defaultAmount: 120_000, recurrence: yearlyOn(9, 12),
    });
    useTemplateStore.setState({ templates: [RENT, inspection], status: 'ready' });
    render(<MonthlySummary />);
    await settled();

    expect(figure('支出')).toBe(100_000);
  });

  it('includes it in the month it does fall in', async () => {
    const premium = makeTemplate({
      id: 4, name: '年払い保険', type: 'expense', defaultAmount: 60_000, recurrence: yearlyOn(6, 1),
    });
    useTemplateStore.setState({ templates: [RENT, premium], status: 'ready' });
    render(<MonthlySummary />);
    await settled();

    expect(figure('支出')).toBe(160_000);
  });

  it('never counts a one-off dated in another month', async () => {
    const trip = makeTemplate({
      id: 5, name: '旅行', type: 'expense', defaultAmount: 200_000, recurrence: onceOn('2026-11-20'),
    });
    useTemplateStore.setState({ templates: [RENT, trip], status: 'ready' });
    render(<MonthlySummary />);
    await settled();

    expect(figure('支出')).toBe(100_000);
  });

  it('still excludes disabled entries', async () => {
    useTemplateStore.setState({
      templates: [RENT, { ...SALARY, enabled: false }],
      status: 'ready',
    });
    render(<MonthlySummary />);
    await settled();

    expect(figure('収入')).toBe(0);
  });

  it('fetches THIS month itself, rather than waiting for 収支管理 to do it', async () => {
    // It used to read the map and nothing else, so the map was EMPTY until
    // 収支管理 was opened -- and this panel is on screen on EVERY view. The
    // household saw figures built from template defaults, then watched them
    // change the moment they visited another screen. Two different answers to
    // 「今月の支出」 for the same month, with nothing explaining the jump.
    const api = createMockApi();
    setApi(api);
    useTemplateStore.setState({ templates: [RENT], status: 'ready' });

    render(<MonthlySummary />);
    await settled();

    expect(api.getMonthlyAmounts).toHaveBeenCalledWith('2026-06');
    expect(api.getMonthlyActuals).toHaveBeenCalledWith('2026-06');
  });

  it('waits for that fetch before stating a figure', async () => {
    // Otherwise the defaults ARE the figure for a moment, which is the very
    // thing the fetch was added to stop.
    const api = createMockApi();
    api.getMonthlyAmounts = vi.fn().mockReturnValue(new Promise(() => {}));
    setApi(api);
    useTemplateStore.setState({ templates: [RENT], status: 'ready' });

    render(<MonthlySummary />);
    // The actuals half still resolves; letting it land keeps its state update
    // inside act() rather than leaking into the next test.
    await act(async () => {});

    expect(screen.getByRole('status')).toHaveTextContent('今月のサマリーを読み込み中');
  });

  it('says it is loading rather than showing ¥0 as a figure', async () => {
    // 「収入 +¥0 / 支出 -¥0」 reads as a month with nothing in it, not as a panel
    // still waiting for its data.
    useTemplateStore.setState({ templates: [], status: 'loading' });
    render(<MonthlySummary />);
    await act(async () => {});

    expect(screen.getByRole('status')).toHaveTextContent('今月のサマリーを読み込み中');
  });
});

describe('when something goes wrong', () => {
  it('offers a retry that re-fetches THIS panel’s month', async () => {
    // LoadGate's default retry runs loadLedgerData(), which deliberately skips
    // the per-month data -- so leaving onRetry off gives this panel a button
    // that re-fetches everything except the thing that failed and leaves the
    // same error on screen. LoadGate's own header names this data as exactly
    // that case.
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const api = createMockApi();
    api.getMonthlyAmounts = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue([{ id: 1, templateId: 1, yearMonth: '2026-06', amount: 88_000, createdAt: '' }]);
    setApi(api);
    useTemplateStore.setState({ templates: [RENT], status: 'ready' });

    render(<MonthlySummary />);
    const retry = await screen.findByRole('button', { name: '再読み込み' });

    await user.click(retry);
    await settled();

    // The override, not the ¥100,000 default: the retry actually reached the
    // server rather than being deduplicated away by the failed attempt.
    expect(figure('支出')).toBe(88_000);
  });
});

describe('after switching to another ledger', () => {
  it('fetches the new ledger’s month instead of holding a skeleton forever', async () => {
    // switchLedger empties every per-month status, and loadLedgerData does NOT
    // refetch months -- so a panel whose effect depends only on [yearMonth,
    // <store actions>] never runs again, and monthStatusOf reports an unknown
    // month as 'loading'. This panel is in the sidebar of every screen, so that
    // is a spinner across the whole application until 収支管理 is opened.
    const api = createMockApi();
    api.getMonthlyAmounts = vi
      .fn()
      .mockResolvedValueOnce([{ id: 1, templateId: 1, yearMonth: '2026-06', amount: 90_000, createdAt: '' }])
      .mockResolvedValue([{ id: 2, templateId: 1, yearMonth: '2026-06', amount: 40_000, createdAt: '' }]);
    setApi(api);
    useTemplateStore.setState({ templates: [RENT], status: 'ready' });

    render(<MonthlySummary />);
    await settled();
    expect(figure('支出')).toBe(90_000);

    await act(async () => {
      await switchLedger(2);
      // fetchTemplates is what re-fills the store switchLedger just emptied.
      useTemplateStore.setState({ templates: [RENT], status: 'ready' });
    });
    await settled();

    expect(figure('支出')).toBe(40_000);
  });
});

describe('the two mounted copies', () => {
  it('ask for the month once between them', async () => {
    // Layout renders this panel twice -- one shell per breakpoint, both mounted,
    // CSS hiding one. Without deduplication in the store that is two identical
    // requests for amounts and two for actuals on every load, and the comment
    // claiming otherwise was simply false.
    const api = createMockApi();
    setApi(api);
    useTemplateStore.setState({ templates: [RENT], status: 'ready' });

    render(
      <>
        <MonthlySummary />
        <MonthlySummary />
      </>,
    );
    await screen.findAllByText('今月のサマリー');

    expect(api.getMonthlyAmounts).toHaveBeenCalledTimes(1);
    expect(api.getMonthlyActuals).toHaveBeenCalledTimes(1);
  });
});
