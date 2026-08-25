import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LedgerSwitcher from './LedgerSwitcher';
import { setApi } from '../../lib/api';
import { createMockApi } from '../../test/mock-api';
import { useSessionStore } from '../../stores/useSessionStore';
import { useAssetStore } from '../../stores/useAssetStore';
import { makeCashAsset } from '../../test/factories';
import type { AppApi, Session } from '../../types';

const TWO_LEDGERS: Session = {
  user: { id: 1, email: 'alice@example.test', displayName: 'alice' },
  ledgers: [
    { id: 10, slug: 'shared', name: '家計', kind: 'shared' },
    { id: 20, slug: 'personal:1', name: 'alice', kind: 'personal' },
  ],
};

let api: AppApi;

beforeEach(() => {
  localStorage.clear();
  api = createMockApi();
  setApi(api);
  useSessionStore.setState({ session: null, activeLedgerId: null });
});

describe('LedgerSwitcher', () => {
  it('renders nothing when there is only one ledger', () => {
    // A select with a single option suggests somewhere else to go when there
    // is not.
    useSessionStore.getState().setSession({
      ...TWO_LEDGERS,
      ledgers: [TWO_LEDGERS.ledgers[0]],
    });

    const { container } = render(<LedgerSwitcher />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing before the session has loaded', () => {
    const { container } = render(<LedgerSwitcher />);
    expect(container).toBeEmptyDOMElement();
  });

  it('lists each ledger with its kind', async () => {
    useSessionStore.getState().setSession(TWO_LEDGERS);
    render(<LedgerSwitcher />);

    expect(await screen.findByRole('option', { name: '家計（共有）' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'alice（個人）' })).toBeInTheDocument();
  });

  it('shows the active ledger as the selection', () => {
    useSessionStore.getState().setSession(TWO_LEDGERS);
    useSessionStore.getState().setActiveLedger(20);

    render(<LedgerSwitcher />);
    expect(screen.getByRole('combobox')).toHaveValue('20');
  });

  it('switches the ledger and reloads the data behind it', async () => {
    useSessionStore.getState().setSession(TWO_LEDGERS);
    (api.getAssets as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeCashAsset({ value: 50_000 }),
    ]);

    render(<LedgerSwitcher />);
    await userEvent.selectOptions(screen.getByRole('combobox'), '20');

    expect(useSessionStore.getState().activeLedgerId).toBe(20);
    await vi.waitFor(() => expect(useAssetStore.getState().assets).toHaveLength(1));
  });
});
