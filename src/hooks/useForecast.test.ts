import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useForecast } from './useForecast';
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
  // Deliberately enormous: if it ever reached the forecast, every figure would
  // move by an amount no rounding could hide.
  value: 50_000_000,
  fields: {},
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const withAssets = (): void => {
  useAssetStore.setState({
    categories: [{ id: 1, name: 'NISA', color: null, sortOrder: 0, fields: [] }],
    assets: [nisa],
  });
};

beforeEach(() => {
  useBalanceStore.setState({ balance: 300_000 });
  useTemplateStore.setState({ templates: [rent] });
  useAssetStore.setState({ categories: [], assets: [], loading: false });
  useUIStore.setState({ holdingsView: 'cash' });
});

// ---------------------------------------------------------------------------
// THE forecast invariant, tested where it is now defined.
//
// The projection used to be assembled in three places (the dashboard chart, the
// dashboard KPIs, the analytics view). Only one of them was covered, so a fourth
// screen -- or an edit to either of the other two -- could put assets into the
// forecast with the suite still green. useForecast is now the single place that
// builds it, which is what makes one test sufficient.
// ---------------------------------------------------------------------------

describe('the forecast is cash, and only cash', () => {
  it('is identical whether or not the ledger holds assets', () => {
    // Catches contamination that does NOT depend on the toggle -- the form the
    // previous version of this test missed on every KPI but one.
    const { result, rerender } = renderHook(() => useForecast(90));
    const withoutAssets = result.current;

    act(withAssets);
    rerender();

    expect(result.current).toEqual(withoutAssets);
  });

  it('does not move when the holdings lens changes', () => {
    // Catches contamination that reads the toggle. The lens is a display
    // choice; a NISA position cannot pay next month's rent.
    withAssets();
    const { result, rerender } = renderHook(() => useForecast(90));
    const asCash = result.current;

    act(() => {
      useUIStore.getState().setHoldingsView('netWorth');
    });
    rerender();

    expect(result.current).toEqual(asCash);
  });

  it('starts from the account balance', () => {
    withAssets();
    const { result } = renderHook(() => useForecast(90));

    expect(result.current[0].balance).toBe(300_000);
  });
});

describe('every dashboard KPI inherits that', () => {
  it('is identical whether or not the ledger holds assets', () => {
    // useDashboardKpis derives from useForecast, so this is a guard on the
    // derivation rather than a second copy of the invariant.
    const { result, rerender } = renderHook(() => useDashboardKpis());
    const withoutAssets = { ...result.current };

    act(withAssets);
    rerender();

    expect(result.current).toEqual(withoutAssets);
  });

  it('projects a floor below the balance, nowhere near the asset total', () => {
    withAssets();
    const { result } = renderHook(() => useDashboardKpis());

    expect(result.current.minBalance90d).toBeLessThan(300_000);
  });
});
