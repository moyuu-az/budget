import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useDashboardReadiness } from './useDashboardReadiness';
import { useMonthlyStore } from '../stores/useMonthlyStore';
import { useSessionStore } from '../stores/useSessionStore';
import { useTemplateStore } from '../stores/useTemplateStore';
import { useAssetStore } from '../stores/useAssetStore';
import { useSettingsStore } from '../stores/useSettingsStore';
import { switchLedger } from '../app/ledger';
import { setApi } from '../lib/api';
import { createMockApi } from '../test/mock-api';
import { makeCashAsset, makeCashCategory, makeTemplate, monthlyOn } from '../test/factories';
import type { AppApi } from '../types';

// ---------------------------------------------------------------------------
// The dashboard's single gate.
//
// Everything on that screen states something about money and gates on this one
// answer, which makes it the place where "still loading" and "nothing to worry
// about" are hardest to tell apart -- and the ledger switcher sits in the
// sidebar beside it, so switching WHILE looking at the dashboard is ordinary.
//
// The failure this file exists to catch has no visible symptom other than a
// skeleton that never resolves: no error, no retry button, and the panels beside
// it (今月のサマリー, キャッシュフロー) showing the NEW ledger's figures while
// these three show nothing.
// ---------------------------------------------------------------------------

const FIXED_TODAY = new Date(2026, 5, 4); // 2026-06-04

let api: AppApi;

/** Everything loadLedgerData would have put in place, for a ready dashboard. */
function seedLedgerData(): void {
  useTemplateStore.setState({
    templates: [makeTemplate({ id: 1, name: '家賃', type: 'expense', defaultAmount: 100_000, recurrence: monthlyOn(27) })],
    status: 'ready',
  });
  useAssetStore.setState({
    categories: [makeCashCategory()],
    assets: [makeCashAsset({ value: 500_000 })],
    status: 'ready',
  });
  useSettingsStore.setState({ status: 'ready' });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(FIXED_TODAY);
  api = createMockApi();
  setApi(api);
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
  seedLedgerData();
});

afterEach(() => {
  setApi(null);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('the dashboard’s readiness', () => {
  it('fetches the months it waits for, rather than waiting on someone else', async () => {
    // An earlier version only OBSERVED them: the view fetched its selected
    // 60-day period while this waited on 90, so the extra month was fetched by
    // nobody and the KPI row spun forever on the default screen.
    const { result } = renderHook(() => useDashboardReadiness(90));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    expect(api.getMonthlyAmountsRange).toHaveBeenCalledTimes(1);
    expect(result.current.points.length).toBeGreaterThan(0);
  });

  it('does not wait on the recorded actuals', async () => {
    // Nothing on the forecast side reads them, and nobody fetches actuals for
    // months ahead -- so waiting would leave the whole dashboard loading for
    // ever. 先月の予実 has its own gate for that.
    const { result } = renderHook(() => useDashboardReadiness(90));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    expect(api.getMonthlyActualsRange).not.toHaveBeenCalled();
  });

  it('re-fetches its range after a ledger switch instead of holding a skeleton', async () => {
    // switchLedger empties every per-month status, and loadLedgerData
    // deliberately does not refetch months. A readiness whose dependencies are
    // [fetch, start, end] never runs again -- and rangeStatusOf reads an empty
    // map as 'loading', so the three panels gating on this hold their skeletons
    // for as long as the user stays on the dashboard. Which is where the ledger
    // switcher is.
    const { result } = renderHook(() => useDashboardReadiness(90));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    await act(async () => {
      await switchLedger(2);
      // Stands in for the fetches loadLedgerData runs; this hook's own half is
      // the one under test.
      seedLedgerData();
    });

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(api.getMonthlyAmountsRange).toHaveBeenCalledTimes(2);
  });

  it('reports a failed range as failed, not as an empty one', async () => {
    // The two are the same map. Called ready, the projection is built from
    // template defaults -- a ¥500,000 rent read as its ¥100,000 default -- and
    // the screen calls the result 余裕.
    api.getMonthlyAmountsRange = vi.fn().mockRejectedValue(new Error('offline'));
    setApi(api);

    const { result } = renderHook(() => useDashboardReadiness(90));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.points).toEqual([]);
  });

  it('retries the months as well as everything else', async () => {
    // LoadGate's default retry runs loadLedgerData, which skips the per-month
    // amounts -- exactly the thing most likely to have failed here.
    api.getMonthlyAmountsRange = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue([]);
    setApi(api);

    const { result } = renderHook(() => useDashboardReadiness(90));
    await waitFor(() => expect(result.current.status).toBe('error'));

    await act(async () => {
      await result.current.retry();
    });

    await waitFor(() => expect(result.current.status).toBe('ready'));
  });
});
