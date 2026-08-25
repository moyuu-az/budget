import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SankeyChart from './index';
import { setApi } from '../../../lib/api';
import { createMockApi } from '../../../test/mock-api';
import { useTemplateStore } from '../../../stores/useTemplateStore';
import { useCategoryStore } from '../../../stores/useCategoryStore';
import { useMonthlyStore } from '../../../stores/useMonthlyStore';
import { makeTemplate, monthlyOn } from '../../../test/factories';
import type { AppApi, Category } from '../../../types';

// ---------------------------------------------------------------------------
// The panel that was left ungated.
//
// Its empty state is 「データがありません」 -- a positive claim about the
// household's month, and a false one while the templates or that month's
// amounts are still in flight. The dashboard's shared readiness does not cover
// it, because this panel has its OWN month selector: the user can page back to a
// month nothing else on the screen ever fetched.
// ---------------------------------------------------------------------------

const FIXED_TODAY = new Date(2026, 5, 20); // 2026-06-20

const SALARY: Category = {
  id: 1, name: '給与', type: 'income', color: '#22c55e', sortOrder: 0, costType: null,
};
const HOUSING: Category = {
  id: 2, name: '住居費', type: 'expense', color: '#f87171', sortOrder: 1, costType: 'fixed',
};

let api: AppApi;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(FIXED_TODAY);

  api = createMockApi();
  setApi(api);
  useCategoryStore.setState({ categories: [SALARY, HOUSING] });
  useTemplateStore.setState({
    templates: [
      makeTemplate({ id: 1, name: '給料', type: 'income', categoryId: 1, defaultAmount: 400_000, recurrence: monthlyOn(25) }),
      makeTemplate({ id: 2, name: '家賃', type: 'expense', categoryId: 2, defaultAmount: 100_000, recurrence: monthlyOn(27) }),
    ],
    status: 'ready',
  });
  useMonthlyStore.getState().reset();
});

afterEach(() => {
  setApi(null);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('while the month is still in flight', () => {
  it('does not claim the household has no data', () => {
    api.getMonthlyAmounts = vi.fn().mockReturnValue(new Promise(() => {}));
    render(<SankeyChart />);

    expect(screen.queryByText('データがありません')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('キャッシュフローを読み込み中');
  });

  it('does not claim it while the TEMPLATES are still in flight either', () => {
    // Both inputs matter: the diagram is built from templates and amounts, and
    // an empty template list looks exactly like a household with no entries.
    api.getMonthlyAmounts = vi.fn().mockResolvedValue([]);
    useTemplateStore.setState({ templates: [], status: 'loading' });
    render(<SankeyChart />);

    expect(screen.queryByText('データがありません')).not.toBeInTheDocument();
  });
});

describe('when the month could not be fetched', () => {
  it('offers a retry that re-runs THIS month, not the whole ledger load', async () => {
    // loadLedgerData deliberately skips per-month data, so the default retry
    // would re-fetch everything except what failed -- a button that visibly does
    // nothing.
    const user = userEvent.setup();
    api.getMonthlyAmounts = vi
      .fn()
      .mockRejectedValueOnce(new Error('nope'))
      .mockResolvedValue([]);

    render(<SankeyChart />);

    await user.click(await screen.findByRole('button', { name: '再読み込み' }));

    expect(api.getMonthlyAmounts).toHaveBeenCalledTimes(2);
  });

  it('re-runs it even though that month was already asked for once', async () => {
    // The dedupe used to be a ref remembering which months had been REQUESTED,
    // which is the wrong memory: a month whose fetch failed was requested, so
    // the retry could never re-run it.
    const user = userEvent.setup();
    api.getMonthlyAmounts = vi.fn().mockRejectedValue(new Error('nope'));

    render(<SankeyChart />);
    await user.click(await screen.findByRole('button', { name: '再読み込み' }));

    expect(api.getMonthlyAmounts).toHaveBeenCalledTimes(2);
  });
});

describe('once everything has arrived', () => {
  it('draws the month', async () => {
    api.getMonthlyAmounts = vi.fn().mockResolvedValue([]);
    render(<SankeyChart />);

    expect(await screen.findByText('今月のキャッシュフロー')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('says so honestly when the month really is empty', async () => {
    // The claim is only false while loading. A household with nothing enabled
    // should still be told there is nothing.
    api.getMonthlyAmounts = vi.fn().mockResolvedValue([]);
    useTemplateStore.setState({ templates: [], status: 'ready' });
    render(<SankeyChart />);

    expect(await screen.findByText('データがありません')).toBeInTheDocument();
  });
});

describe('paging to another month', () => {
  it('fetches the month it moves to', async () => {
    const user = userEvent.setup();
    api.getMonthlyAmounts = vi.fn().mockResolvedValue([]);
    render(<SankeyChart />);

    await screen.findByText('今月のキャッシュフロー');
    await user.click(screen.getByRole('button', { name: '前の月' }));

    expect(api.getMonthlyAmounts).toHaveBeenCalledWith('2026-05');
  });

  it('gates the new month until ITS data lands', async () => {
    // The whole reason this panel cannot use the dashboard's shared readiness:
    // the user can page to a month nothing else on the screen fetched.
    const user = userEvent.setup();
    api.getMonthlyAmounts = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockReturnValue(new Promise(() => {}));

    render(<SankeyChart />);
    await screen.findByText('今月のキャッシュフロー');

    await user.click(screen.getByRole('button', { name: '前の月' }));

    expect(screen.getByRole('status')).toHaveTextContent('キャッシュフローを読み込み中');
    expect(screen.queryByText('データがありません')).not.toBeInTheDocument();
  });
});
