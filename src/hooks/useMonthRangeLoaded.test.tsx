import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useMonthRangeLoaded } from './useMonthLoaded';
import { useMonthlyStore } from '../stores/useMonthlyStore';
import { useSessionStore } from '../stores/useSessionStore';
import { switchLedger } from '../app/ledger';
import { setApi } from '../lib/api';
import { createMockApi } from '../test/mock-api';
import type { AppApi } from '../types';

// ---------------------------------------------------------------------------
// The range half of "load this for the LEDGER, not just for the month".
//
// The single-month half is covered where it is used (MonthlySummary). This one
// needs its own file because the two panels that depend on it are the hardest to
// assert through:
//
//   - the dashboard gates on it, so a ledger switch that never re-fetches leaves
//     残高予測 / 最低残高予測 / 今後の予定 holding their skeletons -- on the very
//     screen the ledger switcher sits on
//   - 分析 does NOT gate on it, which is worse: it goes on drawing, with planned
//     amounts silently falling back to template defaults and every month shown
//     as having no actuals. A household that records its actuals would be told,
//     positively, that it does not
//
// Neither reports an error, so nothing on screen would say anything was wrong.
// ---------------------------------------------------------------------------

let api: AppApi;

beforeEach(() => {
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
});

afterEach(() => {
  setApi(null);
  vi.restoreAllMocks();
});

describe('a range of months', () => {
  it('is fetched again when the ledger changes', async () => {
    const { result } = renderHook(() => useMonthRangeLoaded('2026-06', '2026-08'));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(api.getMonthlyAmountsRange).toHaveBeenCalledTimes(1);

    await act(async () => {
      await switchLedger(2);
    });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    // switchLedger empties every per-month status and loadLedgerData does NOT
    // refetch months. Without the ledger in the hook's dependencies this second
    // call never happens and the status stays 'loading' forever.
    expect(api.getMonthlyAmountsRange).toHaveBeenCalledTimes(2);
  });

  it('fetches the actuals only as far as asked, and only when asked', async () => {
    // 分析 plots planned figures into the FUTURE and actuals only up to today.
    // One end for both would make it wait on actuals nobody records for next
    // March -- permanently.
    const { result } = renderHook(() => useMonthRangeLoaded('2026-03', '2026-09', '2026-06'));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    expect(api.getMonthlyAmountsRange).toHaveBeenCalledWith('2026-03', '2026-09');
    expect(api.getMonthlyActualsRange).toHaveBeenCalledWith('2026-03', '2026-06');
  });

  it('leaves the actuals alone when no end for them is given', async () => {
    const { result } = renderHook(() => useMonthRangeLoaded('2026-06', '2026-08'));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    // The dashboard reads planned figures only. Waiting on actuals nobody
    // fetches here would leave it loading forever -- which is why 'ready' must
    // be reachable without them.
    expect(api.getMonthlyActualsRange).not.toHaveBeenCalled();
  });

  it('does not ask twice for a range two panels both want', async () => {
    renderHook(() => useMonthRangeLoaded('2026-06', '2026-08'));
    const { result } = renderHook(() => useMonthRangeLoaded('2026-06', '2026-08'));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    expect(api.getMonthlyAmountsRange).toHaveBeenCalledTimes(1);
  });

  it('reports a failure rather than an empty range, and retries on demand', async () => {
    // An empty range and a failed one are the same map. Reported as ready, the
    // projection would be built from template defaults with a ¥500,000 rent read
    // as its ¥100,000 default -- a reassuring line drawn from nothing.
    api.getMonthlyAmountsRange = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue([]);
    setApi(api);

    const { result } = renderHook(() => useMonthRangeLoaded('2026-06', '2026-08'));
    await waitFor(() => expect(result.current.status).toBe('error'));

    await act(async () => {
      await result.current.retry();
    });

    expect(result.current.status).toBe('ready');
  });
});
