import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useMonthlyStore } from './useMonthlyStore';
import { setApi } from '../lib/api';
import { createMockApi } from '../test/mock-api';
import type { AppApi, MonthlyAmountsMap } from '../types';

// ---------------------------------------------------------------------------
// Concurrent edits to the same month.
//
// These mutations used to snapshot the WHOLE month map and restore it on
// failure. That is correct in isolation and wrong the moment two run at once --
// and they do: 「デフォルトにリセット」 fires one delete per entry through
// Promise.all, and a household entering several actuals in a row is ordinary.
//
// If B succeeds and A then fails, A's rollback restores a snapshot taken before
// either ran: B reappears on screen having been deleted in the database, and
// the screen disagrees with storage until the next fetch.
// ---------------------------------------------------------------------------

const YM = '2026-06';
let api: AppApi;

const seed = (pairs: Array<[number, number]>): void => {
  useMonthlyStore.setState({
    monthlyAmountsMap: new Map([[YM, new Map(pairs)]]) as MonthlyAmountsMap,
    monthlyActualsMap: new Map(),
    monthStatus: new Map(),
  });
};

const amountsOf = (): Map<number, number> =>
  new Map(useMonthlyStore.getState().monthlyAmountsMap.get(YM) ?? []);

beforeEach(() => {
  api = createMockApi();
  setApi(api);
  useMonthlyStore.getState().reset();
});

afterEach(() => {
  setApi(null);
  vi.restoreAllMocks();
});

describe('a failed delete running beside a successful one', () => {
  it('does not resurrect the row the other one removed', () => {
    // The exact sequence 「デフォルトにリセット」 produces.
    seed([
      [1, 10_000],
      [2, 20_000],
    ]);

    let failA: (reason: Error) => void = () => {};
    api.deleteMonthlyAmount = vi.fn().mockImplementation((templateId: number) =>
      templateId === 1
        ? new Promise((_, reject) => {
            failA = reject;
          })
        : Promise.resolve(),
    );

    const a = useMonthlyStore.getState().deleteMonthlyAmount(1, YM);
    const b = useMonthlyStore.getState().deleteMonthlyAmount(2, YM);

    return b.then(async () => {
      failA(new Error('nope'));
      expect(await a).toBe(false);

      const amounts = amountsOf();
      // A is restored, because its delete failed.
      expect(amounts.get(1)).toBe(10_000);
      // B stays gone, because its delete did not.
      expect(amounts.has(2)).toBe(false);
    });
  });
});

describe('a failed write whose key someone else has since changed', () => {
  it('leaves the newer value alone', () => {
    // Between the write and the failure, a newer edit may have set the same key
    // -- the user retyping, or the other member of a shared ledger. Overwriting
    // that with an older value would undo an edit nobody asked to undo.
    seed([[1, 10_000]]);

    let fail: (reason: Error) => void = () => {};
    api.setMonthlyAmount = vi.fn().mockReturnValueOnce(
      new Promise((_, reject) => {
        fail = reject;
      }),
    );

    const first = useMonthlyStore.getState().setMonthlyAmount(1, YM, 20_000);

    // A newer edit lands while the first is still out.
    api.setMonthlyAmount = vi.fn().mockResolvedValue(undefined);
    return useMonthlyStore
      .getState()
      .setMonthlyAmount(1, YM, 30_000)
      .then(async () => {
        fail(new Error('nope'));
        expect(await first).toBe(false);

        expect(amountsOf().get(1)).toBe(30_000);
      });
  });
});

describe('the ordinary paths', () => {
  it('reports success and keeps the written value', async () => {
    seed([]);
    api.setMonthlyAmount = vi.fn().mockResolvedValue(undefined);

    expect(await useMonthlyStore.getState().setMonthlyAmount(1, YM, 15_000)).toBe(true);
    expect(amountsOf().get(1)).toBe(15_000);
  });

  it('restores a value when its own write failed and nothing else touched it', async () => {
    seed([[1, 10_000]]);
    api.setMonthlyAmount = vi.fn().mockRejectedValue(new Error('nope'));

    expect(await useMonthlyStore.getState().setMonthlyAmount(1, YM, 20_000)).toBe(false);
    expect(amountsOf().get(1)).toBe(10_000);
  });

  it('removes a key that had no previous value when its write failed', async () => {
    // `previous === undefined` means the key was not there; restoring must
    // DELETE it rather than write undefined into the map.
    seed([]);
    api.setMonthlyAmount = vi.fn().mockRejectedValue(new Error('nope'));

    await useMonthlyStore.getState().setMonthlyAmount(1, YM, 20_000);

    expect(amountsOf().has(1)).toBe(false);
  });
});
