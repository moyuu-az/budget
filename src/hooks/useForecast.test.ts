import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useForecast } from './useForecast';
import { useDashboardKpis } from './useDashboardKpis';
import { useTemplateStore } from '../stores/useTemplateStore';
import { useAssetStore } from '../stores/useAssetStore';
import { useUIStore } from '../stores/useUIStore';
import { makeAsset, makeAssetCategory, makeCashAsset, makeCashCategory } from '../test/factories';
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

// Deliberately enormous: if it ever reached the forecast, every figure would
// move by an amount no rounding could hide.
const nisa: Asset = makeAsset({ id: 1, categoryId: 1, name: 'つみたて', value: 50_000_000 });

/** The cash the forecast is allowed to start from, and nothing else. */
const cashOnly = (): void => {
  useAssetStore.setState({
    categories: [makeCashCategory()],
    assets: [makeCashAsset({ value: 300_000 })],
    loading: false,
  });
};

/** The same cash, plus a NISA position the forecast must ignore. */
const withNonCashAssets = (): void => {
  useAssetStore.setState({
    categories: [makeCashCategory(), makeAssetCategory({ id: 1 })],
    assets: [makeCashAsset({ value: 300_000 }), nisa],
    loading: false,
  });
};

beforeEach(() => {
  useTemplateStore.setState({ templates: [rent] });
  cashOnly();
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

    act(withNonCashAssets);
    rerender();

    expect(result.current).toEqual(withoutAssets);
  });

  it('does not move when the holdings lens changes', () => {
    // Catches contamination that reads the toggle. The lens is a display
    // choice; a NISA position cannot pay next month's rent.
    withNonCashAssets();
    const { result, rerender } = renderHook(() => useForecast(90));
    const asCash = result.current;

    act(() => {
      useUIStore.getState().setHoldingsView('netWorth');
    });
    rerender();

    expect(result.current).toEqual(asCash);
  });

  it('starts from the cash holdings, not from the asset total', () => {
    withNonCashAssets();
    const { result } = renderHook(() => useForecast(90));

    // 300,000 -- not 50,300,000. This is the assertion that would have caught
    // someone reaching for totalAssetValue(assets) instead of useCashBalance().
    expect(result.current[0].balance).toBe(300_000);
  });

  it('follows an edit to a cash holding', () => {
    // The balance is no longer a stored figure: editing 現金 on the 資産 screen
    // IS editing the forecast's starting point, in the same render.
    const { result, rerender } = renderHook(() => useForecast(90));

    act(() => {
      useAssetStore.setState({ assets: [makeCashAsset({ value: 450_000 })] });
    });
    rerender();

    expect(result.current[0].balance).toBe(450_000);
  });
});

describe('every dashboard KPI inherits that', () => {
  it('is identical whether or not the ledger holds assets', () => {
    // useDashboardKpis derives from useForecast, so this is a guard on the
    // derivation rather than a second copy of the invariant.
    const { result, rerender } = renderHook(() => useDashboardKpis());
    const withoutAssets = { ...result.current };

    act(withNonCashAssets);
    rerender();

    expect(result.current).toEqual(withoutAssets);
  });

  it('projects a floor below the balance, nowhere near the asset total', () => {
    withNonCashAssets();
    const { result } = renderHook(() => useDashboardKpis());

    expect(result.current.minBalance90d).toBeLessThan(300_000);
  });
});
