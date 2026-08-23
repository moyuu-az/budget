import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setApi } from '../lib/api';
import { createMockApi } from '../test/mock-api';
import { resetLedgerData, switchLedger, loadLedgerData } from './ledger';
import { useSessionStore } from '../stores/useSessionStore';
import { useBalanceStore } from '../stores/useBalanceStore';
import { useCategoryStore } from '../stores/useCategoryStore';
import { useTemplateStore } from '../stores/useTemplateStore';
import { useSnapshotStore } from '../stores/useSnapshotStore';
import { useMonthlyStore } from '../stores/useMonthlyStore';
import type { AppApi, Session } from '../types';

const SESSION: Session = {
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
  useSessionStore.getState().setSession(SESSION);
});

/** Fills every ledger-scoped store with something recognisable. */
function seedStores(): void {
  useBalanceStore.setState({ balance: 1_525_210 });
  useCategoryStore.setState({
    categories: [{ id: 1, name: '住居費', type: 'expense', color: null, sortOrder: 0 }],
  });
  useTemplateStore.setState({
    templates: [
      {
        id: 1, name: 'Rent', dayOfMonth: 27, type: 'expense', enabled: true,
        sortOrder: 0, categoryId: null, defaultAmount: 375_000,
        createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
      },
    ],
  });
  useSnapshotStore.setState({
    snapshots: [{ id: 1, date: '2026-01-01', balance: 1, createdAt: '2026-01-01T00:00:00Z' }],
  });
  useMonthlyStore.setState({ monthlyAmountsMap: new Map([['2026-01', new Map([[1, 100]])]]) });
}

describe('resetLedgerData', () => {
  it('empties every store that holds ledger-scoped data', () => {
    seedStores();
    resetLedgerData();

    expect(useBalanceStore.getState().balance).toBe(0);
    expect(useCategoryStore.getState().categories).toEqual([]);
    expect(useTemplateStore.getState().templates).toEqual([]);
    expect(useSnapshotStore.getState().snapshots).toEqual([]);
    expect(useMonthlyStore.getState().monthlyAmountsMap.size).toBe(0);
    expect(useMonthlyStore.getState().monthlyActualsMap.size).toBe(0);
  });

  it('hands out fresh Maps rather than reusing one instance', () => {
    // A shared instance would let a stale reference keep mutating live state.
    const first = useMonthlyStore.getState().monthlyAmountsMap;
    resetLedgerData();
    expect(useMonthlyStore.getState().monthlyAmountsMap).not.toBe(first);
  });
});

describe('switchLedger', () => {
  it('clears the previous ledger BEFORE the new data arrives', async () => {
    // The ordering is the point. If the ledger changed first, the switcher
    // would already read '個人' while every panel still showed the household's
    // figures -- one household's money under another's name.
    seedStores();
    let balanceWhenFetched: number | null = null;
    (api.getBalance as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      balanceWhenFetched = useBalanceStore.getState().balance;
      return 50_000;
    });

    await switchLedger(20);

    expect(balanceWhenFetched).toBe(0);
    expect(useBalanceStore.getState().balance).toBe(50_000);
  });

  it('activates the requested ledger', async () => {
    await switchLedger(20);
    expect(useSessionStore.getState().activeLedgerId).toBe(20);
  });

  it('does nothing when the ledger is already active', async () => {
    seedStores();
    await switchLedger(10);

    expect(api.getBalance).not.toHaveBeenCalled();
    // Not cleared either -- there was nothing to switch away from.
    expect(useBalanceStore.getState().balance).toBe(1_525_210);
  });

  it('stays on the current ledger when asked for one outside the session', async () => {
    await switchLedger(999);

    expect(useSessionStore.getState().activeLedgerId).toBe(10);
    // Still reloads: the stores were cleared on the way in and must not be
    // left empty just because the switch was refused.
    expect(api.getBalance).toHaveBeenCalled();
  });

  it('remembers the choice for the next visit', async () => {
    await switchLedger(20);
    expect(localStorage.getItem('balance-forecast:active-ledger')).toBe('20');
  });
});

describe('loadLedgerData', () => {
  it('fetches what every view needs, and nothing month-specific', async () => {
    await loadLedgerData();

    expect(api.getBalance).toHaveBeenCalled();
    expect(api.getCategories).toHaveBeenCalled();
    expect(api.getTemplates).toHaveBeenCalled();
    expect(api.getSnapshots).toHaveBeenCalled();
    // Monthly data is fetched per month as the user navigates.
    expect(api.getMonthlyAmounts).not.toHaveBeenCalled();
  });
});
