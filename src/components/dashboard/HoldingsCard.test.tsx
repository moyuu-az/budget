import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import HoldingsCard from './HoldingsCard';
import { setApi } from '../../lib/api';
import { createMockApi } from '../../test/mock-api';
import { useAssetStore } from '../../stores/useAssetStore';
import { useBalanceStore } from '../../stores/useBalanceStore';
import { useUIStore } from '../../stores/useUIStore';
import type { Asset, AssetCategory } from '../../types';

const NISA: AssetCategory = { id: 1, name: 'NISA', color: '#22c55e', sortOrder: 0, fields: [] };

const holding = (overrides: Partial<Asset> = {}): Asset => ({
  id: 1,
  categoryId: 1,
  name: 'つみたて',
  value: 1_000_000,
  fields: {},
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...overrides,
});

beforeEach(() => {
  localStorage.clear();
  setApi(createMockApi());
  useAssetStore.setState({ categories: [], assets: [], loading: false });
  useBalanceStore.setState({ balance: 500_000 });
  useUIStore.setState({ holdingsView: 'cash' });
});

afterEach(() => {
  setApi(null);
  vi.restoreAllMocks();
});

describe('when the ledger does not track assets', () => {
  it('renders nothing at all', () => {
    // Asset tracking is optional. A card offering a choice between one number
    // and the same number -- with 純資産 reading ¥0 -- looks like a fault.
    const { container } = render(<HoldingsCard />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('when the ledger tracks assets', () => {
  beforeEach(() => {
    useAssetStore.setState({ categories: [NISA], assets: [holding()] });
  });

  it('shows the account balance under the cash lens', () => {
    render(<HoldingsCard />);
    expect(screen.getByText('¥500,000')).toBeInTheDocument();
    expect(screen.queryByText('¥1,500,000')).not.toBeInTheDocument();
  });

  it('adds the assets under the net-worth lens', async () => {
    const user = userEvent.setup();
    render(<HoldingsCard />);

    await user.click(screen.getByRole('tab', { name: '純資産' }));

    expect(screen.getByText('¥1,500,000')).toBeInTheDocument();
  });

  it('never shows the total without its parts', async () => {
    // Someone who records their bank account as a 現金 asset has it counted
    // twice. The app cannot know whether that happened -- this line is what
    // makes it visible instead of hiding it inside one number.
    const user = userEvent.setup();
    render(<HoldingsCard />);

    await user.click(screen.getByRole('tab', { name: '純資産' }));

    expect(screen.getByText(/残高 ¥500,000 ＋ 資産 ¥1,000,000/)).toBeInTheDocument();
  });

  it('breaks the assets down by category', async () => {
    const user = userEvent.setup();
    useAssetStore.setState({
      categories: [NISA, { id: 2, name: '現金', color: '#38bdf8', sortOrder: 1, fields: [] }],
      assets: [holding(), holding({ id: 2, categoryId: 2, value: 250_000 })],
    });
    render(<HoldingsCard />);

    await user.click(screen.getByRole('tab', { name: '純資産' }));

    expect(screen.getByText('NISA')).toBeInTheDocument();
    expect(screen.getByText('¥250,000')).toBeInTheDocument();
  });

  it('shows holdings whose category is not loaded as その他', async () => {
    // Reachable in a shared ledger: the other member adds a category, this
    // client refetches holdings only. Dropping them would make the chips
    // quietly fail to add up to the 資産 figure above them.
    const user = userEvent.setup();
    useAssetStore.setState({
      categories: [NISA],
      assets: [holding(), holding({ id: 2, categoryId: 99, value: 40_000 })],
    });
    render(<HoldingsCard />);

    await user.click(screen.getByRole('tab', { name: '純資産' }));

    expect(screen.getByText('その他')).toBeInTheDocument();
    expect(screen.getByText('¥40,000')).toBeInTheDocument();
    expect(screen.getByText(/資産 ¥1,040,000/)).toBeInTheDocument();
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
      categories: [{ id: 3, name: '住宅ローン', color: null, sortOrder: 0, fields: [] }],
      assets: [holding({ id: 5, categoryId: 3, value: -28_000_000 })],
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
