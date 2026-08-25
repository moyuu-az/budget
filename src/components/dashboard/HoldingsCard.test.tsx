import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import HoldingsCard from './HoldingsCard';
import { setApi } from '../../lib/api';
import { createMockApi } from '../../test/mock-api';
import { useAssetStore } from '../../stores/useAssetStore';
import { useUIStore } from '../../stores/useUIStore';
import { makeAsset, makeAssetCategory, makeCashAsset, makeCashCategory } from '../../test/factories';

const CASH = makeCashCategory();
const NISA = makeAssetCategory({ id: 1, name: 'NISA' });

beforeEach(() => {
  localStorage.clear();
  setApi(createMockApi());
  // Every ledger has a cash category; the only way to see none is mid-fetch.
  useAssetStore.setState({
    categories: [CASH],
    assets: [makeCashAsset({ value: 500_000 })],
    status: 'ready',
  });
  useUIStore.setState({ holdingsView: 'cash' });
});

afterEach(() => {
  setApi(null);
  vi.restoreAllMocks();
});

describe('before the categories have loaded', () => {
  it('shows a placeholder, never a figure', () => {
    // Not ¥0: that reads as a reading. Every ledger has a cash category once the
    // fetch lands, so this state is always "not loaded", never "nothing here".
    useAssetStore.setState({ categories: [], assets: [], status: 'loading' });
    render(<HoldingsCard />);

    expect(screen.getByRole('status', { name: '資産を読み込み中' })).toBeInTheDocument();
    expect(screen.queryByText('¥0')).not.toBeInTheDocument();
  });

  it('offers a retry when the fetch failed', () => {
    useAssetStore.setState({ categories: [], assets: [], status: 'error' });
    render(<HoldingsCard />);

    expect(screen.getByText('資産を読み込めませんでした')).toBeInTheDocument();
  });
});

describe('when the ledger holds cash only', () => {
  it('shows the cash total', () => {
    render(<HoldingsCard />);
    expect(screen.getByText('¥500,000')).toBeInTheDocument();
  });

  it('offers no lens toggle', () => {
    // 現金 and 純資産 would be the same number. A toggle between a figure and
    // itself invites the user to look for a difference that is not there.
    render(<HoldingsCard />);
    expect(screen.queryByRole('tab', { name: '純資産' })).not.toBeInTheDocument();
  });

  it('offers no toggle for a category that holds nothing either', () => {
    // Creating a NISA category and not filling it in is an ordinary half-done
    // state. The two views would still be the same number, and the 純資産 view
    // would read 「＋ その他 ¥0」 with no chip beside it, because
    // summarizeHoldings drops categories holding nothing.
    useAssetStore.setState({
      categories: [CASH, NISA],
      assets: [makeCashAsset({ value: 500_000 })],
    });
    render(<HoldingsCard />);

    expect(screen.queryByRole('tab', { name: '純資産' })).not.toBeInTheDocument();
  });

  it('shows cash even when a persisted preference says 純資産', () => {
    // The preference survives in localStorage from a ledger that DID hold
    // assets. Without the guard the card would render its 純資産 breakdown with
    // no toggle to get back.
    useUIStore.setState({ holdingsView: 'netWorth' });
    render(<HoldingsCard />);

    expect(screen.getByText('現金')).toBeInTheDocument();
    expect(screen.queryByText('純資産')).not.toBeInTheDocument();
  });
});

describe('when the ledger holds more than cash', () => {
  beforeEach(() => {
    useAssetStore.setState({
      categories: [CASH, NISA],
      assets: [makeCashAsset({ value: 500_000 }), makeAsset({ value: 1_000_000 })],
    });
  });

  it('shows the cash total under the cash lens', () => {
    render(<HoldingsCard />);
    expect(screen.getByText('¥500,000')).toBeInTheDocument();
    expect(screen.queryByText('¥1,500,000')).not.toBeInTheDocument();
  });

  it('shows net worth -- cash INCLUDED, not added twice -- under the other lens', async () => {
    const user = userEvent.setup();
    render(<HoldingsCard />);

    await user.click(screen.getByRole('tab', { name: '純資産' }));

    // 500,000 cash + 1,000,000 NISA. The old shape produced 2,000,000 here for
    // anyone who recorded their bank balance as a 現金 asset as well.
    expect(screen.getByText('¥1,500,000')).toBeInTheDocument();
  });

  it('never shows the total without its parts', async () => {
    const user = userEvent.setup();
    render(<HoldingsCard />);

    await user.click(screen.getByRole('tab', { name: '純資産' }));

    expect(screen.getByText(/現金 ¥500,000 ＋ その他 ¥1,000,000/)).toBeInTheDocument();
  });

  it('breaks the holdings down by category, cash first', async () => {
    const user = userEvent.setup();
    render(<HoldingsCard />);

    await user.click(screen.getByRole('tab', { name: '純資産' }));

    const names = screen.getAllByRole('listitem').map((item) => item.textContent);
    expect(names[0]).toContain('現金');
    expect(names[1]).toContain('NISA');
  });

  it('shows holdings whose category is not loaded as その他', async () => {
    // Reachable in a shared ledger: the other member adds a category, this
    // client refetches holdings only. Dropping them would make the chips
    // quietly fail to add up to the total above them.
    const user = userEvent.setup();
    useAssetStore.setState({
      categories: [CASH, NISA],
      assets: [
        makeCashAsset({ value: 500_000 }),
        makeAsset({ value: 1_000_000 }),
        makeAsset({ id: 2, categoryId: 99, value: 40_000 }),
      ],
    });
    render(<HoldingsCard />);

    await user.click(screen.getByRole('tab', { name: '純資産' }));

    expect(screen.getByText('その他')).toBeInTheDocument();
    expect(screen.getByText('¥40,000')).toBeInTheDocument();
    expect(screen.getByText(/その他 ¥1,040,000/)).toBeInTheDocument();
  });

  it('does not invent an その他 row when every holding has its category', async () => {
    const user = userEvent.setup();
    render(<HoldingsCard />);

    await user.click(screen.getByRole('tab', { name: '純資産' }));

    expect(screen.queryByText('その他')).not.toBeInTheDocument();
  });

  it('shows a loan tracked as a negative asset', async () => {
    const user = userEvent.setup();
    useAssetStore.setState({
      categories: [CASH, makeAssetCategory({ id: 3, name: '住宅ローン', color: null })],
      assets: [
        makeCashAsset({ value: 500_000 }),
        makeAsset({ id: 5, categoryId: 3, value: -28_000_000 }),
      ],
    });
    render(<HoldingsCard />);

    await user.click(screen.getByRole('tab', { name: '純資産' }));

    expect(screen.getByText('-¥27,500,000')).toBeInTheDocument();
  });

  it('remembers the chosen lens', async () => {
    // Persisted through useUIStore, so switching views or reloading does not
    // send the user back to a lens they did not pick.
    const user = userEvent.setup();
    render(<HoldingsCard />);

    await user.click(screen.getByRole('tab', { name: '純資産' }));

    expect(useUIStore.getState().holdingsView).toBe('netWorth');
  });
});
