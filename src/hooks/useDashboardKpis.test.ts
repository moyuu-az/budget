import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useDashboardKpis } from './useDashboardKpis';
import { useBalanceStore } from '../stores/useBalanceStore';
import { useTemplateStore } from '../stores/useTemplateStore';
import { useAssetStore } from '../stores/useAssetStore';
import { useUIStore } from '../stores/useUIStore';
import type { Asset, EntryTemplate } from '../types';

const rent: EntryTemplate = {
  id: 1,
  name: '家賃',
  dayOfMonth: 27,
  type: 'expense',
  enabled: true,
  sortOrder: 0,
  categoryId: null,
  defaultAmount: 120_000,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const nisa: Asset = {
  id: 1,
  categoryId: 1,
  name: 'つみたて',
  // Deliberately enormous: if it ever reached the forecast, every figure below
  // would move by an amount no rounding could hide.
  value: 50_000_000,
  fields: {},
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

beforeEach(() => {
  useBalanceStore.setState({ balance: 300_000 });
  useTemplateStore.setState({ templates: [rent] });
  useAssetStore.setState({
    categories: [{ id: 1, name: 'NISA', color: null, sortOrder: 0, fields: [] }],
    assets: [nisa],
  });
  useUIStore.setState({ holdingsView: 'cash' });
});

describe('the forecast is always cash', () => {
  it('does not move when the holdings lens changes', () => {
    // THE constraint behind the dashboard's cash/net-worth toggle. A NISA
    // position cannot pay next month's rent, so letting it lift the projected
    // floor would silence the minimum-balance warning this app exists to raise.
    const { result, rerender } = renderHook(() => useDashboardKpis());
    const asCash = { ...result.current };

    act(() => {
      useUIStore.getState().setHoldingsView('netWorth');
    });
    rerender();

    expect(result.current).toEqual(asCash);
  });

  it('projects from the account balance, not from net worth', () => {
    const { result } = renderHook(() => useDashboardKpis());

    // 300,000 held, 120,000 of rent ahead: the floor is well below the balance
    // and nowhere near the 50,000,000 sitting in 資産.
    expect(result.current.minBalance90d).toBeLessThan(300_000);
    expect(result.current.minBalance90d).toBeLessThan(1_000_000);
  });
});
