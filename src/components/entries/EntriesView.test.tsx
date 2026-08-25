import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EntriesView from './EntriesView';
import { setApi } from '../../lib/api';
import { createMockApi } from '../../test/mock-api';
import { useTemplateStore } from '../../stores/useTemplateStore';
import { useCategoryStore } from '../../stores/useCategoryStore';
import { useMonthlyStore } from '../../stores/useMonthlyStore';
import { useToastStore } from '../../stores/useToastStore';
import { intervalOn, makeTemplate, monthlyOn, onceOn, yearlyOn } from '../../test/factories';
import type { AppApi, Category } from '../../types';

// ---------------------------------------------------------------------------
// 収支管理, once an entry can skip a month.
//
// The screen states a 収入合計 and a 支出合計 for the month it is showing. The
// question this file exists to answer is what those figures are allowed to
// contain: an entry that is enabled all year but happens once must NOT be in
// eleven of them, and it must not vanish from the app either -- someone
// correcting next year's car inspection in September needs somewhere to click.
//
// "Today" is pinned so the view opens on a known month.
// ---------------------------------------------------------------------------

const FIXED_TODAY = new Date(2026, 5, 4); // 2026-06-04 -> the view opens on 2026-06

const HOUSING: Category = {
  id: 1, name: '住居費', type: 'expense', color: '#f87171', sortOrder: 0, costType: 'fixed',
};

const RENT = makeTemplate({
  id: 1, name: '家賃', type: 'expense', categoryId: 1, defaultAmount: 100_000, recurrence: monthlyOn(27),
});

/** Annual, in a month the view is NOT showing. */
const INSPECTION = makeTemplate({
  id: 2, name: '車検', type: 'expense', categoryId: 1, defaultAmount: 120_000, recurrence: yearlyOn(9, 12),
});

/** Annual, in the month the view IS showing. */
const JUNE_PREMIUM = makeTemplate({
  id: 3, name: '年払い保険', type: 'expense', categoryId: 1, defaultAmount: 60_000, recurrence: yearlyOn(6, 1),
});

/** A one-off already in the past. */
const LAST_YEARS_TRIP = makeTemplate({
  id: 4, name: '去年の旅行', type: 'expense', categoryId: 1, defaultAmount: 200_000, recurrence: onceOn('2025-08-10'),
});

/** Bimonthly, anchored so that June is NOT one of its months. */
const WATER = makeTemplate({
  id: 5, name: '水道代', type: 'expense', categoryId: 1, defaultAmount: 15_000, recurrence: intervalOn(2, '2026-05', 20),
});

let api: AppApi;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(FIXED_TODAY);

  api = createMockApi();
  setApi(api);
  useCategoryStore.setState({ categories: [HOUSING] });
  useMonthlyStore.setState({ monthlyAmountsMap: new Map(), monthlyActualsMap: new Map() });
  useToastStore.setState({ toasts: [], queue: [] });
});

afterEach(() => {
  setApi(null);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** The 支出合計 headline, read as a number. */
function expenseTotal(): number {
  const text = screen.getByText('支出合計').parentElement!.textContent ?? '';
  return Number(text.replace(/[^0-9]/g, ''));
}

describe('the month total', () => {
  it('counts only the entries that fall in the month on screen', () => {
    useTemplateStore.setState({ templates: [RENT, INSPECTION, WATER] });
    render(<EntriesView />);

    // 家賃 only. 車検 is September's, 水道代 is May/July's -- both enabled, and
    // neither is June's money.
    expect(expenseTotal()).toBe(100_000);
  });

  it('counts an annual entry in the month it does fall in', () => {
    useTemplateStore.setState({ templates: [RENT, JUNE_PREMIUM] });
    render(<EntriesView />);

    expect(expenseTotal()).toBe(160_000);
  });

  it('never counts a one-off whose date has passed', () => {
    useTemplateStore.setState({ templates: [RENT, LAST_YEARS_TRIP] });
    render(<EntriesView />);

    expect(expenseTotal()).toBe(100_000);
  });

  it('keeps the 固定費/変動費 split adding up to the total beside it', () => {
    // The split and the total are built from the SAME narrowed list. If only one
    // of them learned about recurrence, the parts would stop summing to the
    // whole -- with nothing on screen saying which of the two is wrong.
    useTemplateStore.setState({ templates: [RENT, INSPECTION] });
    render(<EntriesView />);

    // Scoped to the 支出の内訳 panel: 「固定費」 also appears as the category's
    // own badge in the entry list below, which is correct and not what this
    // asserts.
    const panel = screen.getByText('支出の内訳').closest('div')!.parentElement!;
    const fixed = within(panel).getByText('固定費').closest('li')!;
    expect(fixed).toHaveTextContent('¥100,000');
  });
});

describe('the entry list', () => {
  it('lists this month’s entries', () => {
    useTemplateStore.setState({ templates: [RENT, INSPECTION] });
    render(<EntriesView />);

    expect(screen.getByText('家賃')).toBeInTheDocument();
  });

  it('says how often an irregular entry recurs, so the month reads correctly', () => {
    // June carrying a ¥60,000 annual premium is an ordinary month with a yearly
    // bill in it, not a bad month. Without the label there is nothing on screen
    // that distinguishes the two.
    useTemplateStore.setState({ templates: [JUNE_PREMIUM] });
    render(<EntriesView />);

    expect(screen.getByText('1日 (年1回)')).toBeInTheDocument();
  });

  it('shows the CLAMPED day, so the row agrees with the forecast', () => {
    // Stored on the 31st; June has 30 days. The row must say when the money
    // actually moves.
    useTemplateStore.setState({
      templates: [makeTemplate({ id: 9, name: 'カード', categoryId: 1, recurrence: monthlyOn(31) })],
    });
    render(<EntriesView />);

    expect(screen.getByText('30日')).toBeInTheDocument();
  });
});

describe('entries that do not fall in this month', () => {
  it('are not listed among the month’s entries', () => {
    useTemplateStore.setState({ templates: [RENT, INSPECTION] });
    render(<EntriesView />);

    // Present on the page (inside the collapsed section's count) but not as a
    // row in the category groups.
    expect(screen.queryByText('車検')).not.toBeInTheDocument();
  });

  it('are offered in their own section, collapsed, with a count', () => {
    useTemplateStore.setState({ templates: [RENT, INSPECTION, WATER] });
    render(<EntriesView />);

    expect(screen.getByRole('button', { name: /6月には発生しない項目/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.getByText('2 件')).toBeInTheDocument();
  });

  it('say when they DO occur once expanded', async () => {
    // The point of the section: an absence from the total becomes an answer
    // rather than a mystery.
    const user = userEvent.setup();
    useTemplateStore.setState({ templates: [RENT, INSPECTION, WATER] });
    render(<EntriesView />);

    await user.click(screen.getByRole('button', { name: /6月には発生しない項目/ }));

    expect(screen.getByText('車検')).toBeInTheDocument();
    expect(screen.getByText('毎年9月12日')).toBeInTheDocument();
    expect(screen.getByText('2ヶ月ごと 20日')).toBeInTheDocument();
    expect(screen.getByText(/上の合計には含まれていません/)).toBeInTheDocument();
  });

  it('stay editable from a month they do not occur in', async () => {
    // Otherwise a September-only entry is reachable only during September, and
    // the obvious workaround -- navigate eleven months -- is not obvious at all.
    const user = userEvent.setup();
    useTemplateStore.setState({ templates: [RENT, INSPECTION] });
    render(<EntriesView />);

    await user.click(screen.getByRole('button', { name: /6月には発生しない項目/ }));
    await user.click(screen.getByRole('button', { name: '車検を編集' }));

    expect(screen.getByLabelText('繰り返し')).toHaveValue('yearly');
    expect(screen.getByLabelText('月')).toHaveValue('9');
  });

  it('marks a one-off that has already happened as 終了', async () => {
    // 「2025年11月20日」 in a list of things that are not this month reads as a
    // spend still to come. Budgeting for money already spent is the mistake.
    const user = userEvent.setup();
    useTemplateStore.setState({ templates: [RENT, LAST_YEARS_TRIP] });
    render(<EntriesView />);

    await user.click(screen.getByRole('button', { name: /6月には発生しない項目/ }));

    expect(screen.getByText('終了')).toBeInTheDocument();
    // The year is shown, which is what makes 終了 checkable by the reader.
    expect(screen.getByText('2025年8月10日 (1回のみ)')).toBeInTheDocument();
  });

  it('does not mark a one-off still to come', async () => {
    const user = userEvent.setup();
    const upcoming = makeTemplate({
      id: 6, name: '旅行', categoryId: 1, defaultAmount: 200_000, recurrence: onceOn('2026-11-20'),
    });
    useTemplateStore.setState({ templates: [RENT, upcoming] });
    render(<EntriesView />);

    await user.click(screen.getByRole('button', { name: /6月には発生しない項目/ }));

    expect(screen.queryByText('終了')).not.toBeInTheDocument();
    expect(screen.getByText('2026年11月20日 (1回のみ)')).toBeInTheDocument();
  });

  it('are absent entirely when every entry falls in this month', () => {
    useTemplateStore.setState({ templates: [RENT, JUNE_PREMIUM] });
    render(<EntriesView />);

    expect(screen.queryByRole('button', { name: /発生しない項目/ })).not.toBeInTheDocument();
  });
});

describe('copying last month’s amounts', () => {
  it('names the two months and nothing else', async () => {
    // WHICH entries are copied is the server's decision, made from the rows
    // under a lock. An earlier version computed the list here; that looked like
    // it kept the occurrence rule in one place and actually moved the
    // ENFORCEMENT to the client, where a stale tab or the other member of a
    // shared ledger makes the list wrong.
    const user = userEvent.setup();
    api.copyMonthlyAmounts = vi.fn().mockResolvedValue(undefined);
    api.getMonthlyAmounts = vi.fn().mockResolvedValue([]);
    useTemplateStore.setState({ templates: [RENT, INSPECTION, WATER, LAST_YEARS_TRIP] });
    render(<EntriesView />);

    await user.click(screen.getByRole('button', { name: '先月からコピー' }));

    expect(api.copyMonthlyAmounts).toHaveBeenCalledWith('2026-05', '2026-06');
  });

  it('copies into the month on screen, not into today’s', async () => {
    const user = userEvent.setup();
    api.copyMonthlyAmounts = vi.fn().mockResolvedValue(undefined);
    api.getMonthlyAmounts = vi.fn().mockResolvedValue([]);
    useTemplateStore.setState({ templates: [RENT] });
    render(<EntriesView />);

    await user.click(screen.getByRole('button', { name: '翌月' }));
    await user.click(screen.getByRole('button', { name: '先月からコピー' }));

    expect(api.copyMonthlyAmounts).toHaveBeenCalledWith('2026-06', '2026-07');
  });
});

describe('when the copy fails', () => {
  // Asserted against the TOAST STORE, not the DOM. EntriesView does not render
  // toasts -- the shell does -- so `queryByText` would find nothing here whether
  // the message was raised or not, and every one of these tests would pass while
  // proving nothing. The positive case below is what caught that.
  const messages = (): string[] => useToastStore.getState().toasts.map((t) => t.message);

  it('does not claim the month was budgeted', async () => {
    // The store swallows the throw (reportError has already raised the toast),
    // so a try/catch at the call site could never run: 「コピーしました」 would
    // fire beside the error, telling a household its month is set when nothing
    // was written.
    const user = userEvent.setup();
    api.copyMonthlyAmounts = vi.fn().mockRejectedValue(new Error('nope'));
    useTemplateStore.setState({ templates: [RENT] });
    render(<EntriesView />);

    await user.click(screen.getByRole('button', { name: '先月からコピー' }));

    expect(messages()).not.toContain('先月の金額をコピーしました');
  });

  it('does not claim success when the copy landed but could not be read back', async () => {
    // The database is right and the screen is wrong -- still not a success from
    // where the user is sitting, because the figures in front of them are the
    // previous month's.
    const user = userEvent.setup();
    api.copyMonthlyAmounts = vi.fn().mockResolvedValue(undefined);
    api.getMonthlyAmounts = vi.fn().mockRejectedValue(new Error('nope'));
    useTemplateStore.setState({ templates: [RENT] });
    render(<EntriesView />);

    await user.click(screen.getByRole('button', { name: '先月からコピー' }));

    expect(messages()).not.toContain('先月の金額をコピーしました');
  });

  it('says so when it worked', async () => {
    const user = userEvent.setup();
    api.copyMonthlyAmounts = vi.fn().mockResolvedValue(undefined);
    api.getMonthlyAmounts = vi.fn().mockResolvedValue([]);
    useTemplateStore.setState({ templates: [RENT] });
    render(<EntriesView />);

    await user.click(screen.getByRole('button', { name: '先月からコピー' }));

    await vi.waitFor(() => expect(messages()).toContain('先月の金額をコピーしました'));
  });
});

describe('resetting to defaults', () => {
  const messages = (): string[] => useToastStore.getState().toasts.map((t) => t.message);

  it('does not claim success when only some rows were reset', async () => {
    // These deletes run concurrently and one refusal does not stop the rest, so
    // a partial failure is the LIKELY failure. The store swallows its own errors
    // (reportError has already raised the toast), so a try/catch here could
    // never run and 「リセットしました」 would fire regardless.
    const user = userEvent.setup();
    // Seeded through the API, not the store: EntriesView fetches the month on
    // mount, and a store seeded beforehand is overwritten by that answer.
    api.getMonthlyAmounts = vi.fn().mockResolvedValueOnce([
      { id: 1, templateId: 1, yearMonth: '2026-06', amount: 90_000, createdAt: '' },
      { id: 2, templateId: 7, yearMonth: '2026-06', amount: 5_000, createdAt: '' },
    ]);
    api.deleteMonthlyAmount = vi
      .fn()
      .mockImplementation((templateId: number) =>
        templateId === 1 ? Promise.reject(new Error('nope')) : Promise.resolve(),
      );
    useTemplateStore.setState({ templates: [RENT] });
    render(<EntriesView />);
    // Wait for the month to land before resetting it. The override (¥90,000)
    // replaces the ¥100,000 default, so its appearance is the signal.
    await vi.waitFor(() => expect(expenseTotal()).toBe(90_000));

    await user.click(screen.getByRole('button', { name: 'デフォルトにリセット' }));
    await user.click(await screen.findByRole('button', { name: 'リセット' }));

    await vi.waitFor(() =>
      expect(messages()).toContain('一部の金額をリセットできませんでした'),
    );
    expect(messages()).not.toContain('デフォルト金額にリセットしました');
    // And the month is re-read, because which rows survived is only knowable
    // from the server.
    expect(api.getMonthlyAmounts).toHaveBeenCalledWith('2026-06');
  });

  it('says so when every row was reset', async () => {
    const user = userEvent.setup();
    api.getMonthlyAmounts = vi.fn().mockResolvedValueOnce([
      { id: 1, templateId: 1, yearMonth: '2026-06', amount: 90_000, createdAt: '' },
    ]);
    api.deleteMonthlyAmount = vi.fn().mockResolvedValue(undefined);
    useTemplateStore.setState({ templates: [RENT] });
    render(<EntriesView />);
    await vi.waitFor(() => expect(expenseTotal()).toBe(90_000));

    await user.click(screen.getByRole('button', { name: 'デフォルトにリセット' }));
    await user.click(await screen.findByRole('button', { name: 'リセット' }));

    await vi.waitFor(() => expect(messages()).toContain('デフォルト金額にリセットしました'));
  });
});

describe('navigating to another month', () => {
  it('moves an entry between the two sections', async () => {
    const user = userEvent.setup();
    useTemplateStore.setState({ templates: [RENT, JUNE_PREMIUM] });
    render(<EntriesView />);

    // June: the premium is one of the month's entries.
    expect(expenseTotal()).toBe(160_000);
    expect(screen.queryByRole('button', { name: /発生しない項目/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '翌月' }));

    // July: it is not, and the total drops by exactly its amount.
    expect(expenseTotal()).toBe(100_000);
    const dormant = screen.getByRole('button', { name: /7月には発生しない項目/ });
    expect(within(dormant).getByText('1 件')).toBeInTheDocument();
  });
});
