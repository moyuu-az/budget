import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useSnapshotStore } from './useSnapshotStore';
import { useToastStore } from './useToastStore';
import { setApi } from '../lib/api';
import { createMockApi } from '../test/mock-api';
import type { AppApi, BalanceSnapshot } from '../types';

const snapshot = (overrides: Partial<BalanceSnapshot> = {}): BalanceSnapshot => ({
  id: 1,
  date: '2026-08-01',
  balance: 300_000,
  createdAt: '2026-08-01T00:00:00Z',
  ...overrides,
});

let api: AppApi;

beforeEach(() => {
  api = createMockApi();
  setApi(api);
  useSnapshotStore.setState({ snapshots: [], loading: false });
  useToastStore.setState({ toasts: [], queue: [] });
});

afterEach(() => {
  setApi(null);
  vi.restoreAllMocks();
});

describe('addSnapshot', () => {
  it('reports success so the caller can say 「記録しました」', async () => {
    api.addSnapshot = vi.fn().mockResolvedValue(snapshot());
    expect(await useSnapshotStore.getState().addSnapshot('2026-08-01', 300_000)).toBe(true);
  });

  it('reports failure instead of resolving as if it had stored the record', async () => {
    // This is the regression the boolean exists for. The store swallows the
    // throw (reportError raises the toast), so a try/catch at the call site
    // never runs -- and the form used to show 「記録しました」 beside the error
    // toast and close as if the record had been saved.
    api.addSnapshot = vi.fn().mockRejectedValue(new Error('offline'));

    expect(await useSnapshotStore.getState().addSnapshot('2026-08-01', 300_000)).toBe(false);
    expect(useSnapshotStore.getState().snapshots).toEqual([]);
  });

  it('replaces the row for a date instead of listing it twice', async () => {
    // The server upserts on (ledger, date), so recording the same day twice
    // returns the SAME row. Appending it put two elements with one id into the
    // list: duplicate React keys, and two records of one day on screen.
    const existing = snapshot({ id: 7, date: '2026-08-01', balance: 300_000 });
    useSnapshotStore.setState({ snapshots: [existing] });
    api.addSnapshot = vi.fn().mockResolvedValue({ ...existing, balance: 450_000 });

    await useSnapshotStore.getState().addSnapshot('2026-08-01', 450_000);

    expect(useSnapshotStore.getState().snapshots).toEqual([
      { ...existing, balance: 450_000 },
    ]);
  });

  it('keeps the list newest-first, the order getSnapshots returns', async () => {
    useSnapshotStore.setState({
      snapshots: [snapshot({ id: 2, date: '2026-08-10' }), snapshot({ id: 1, date: '2026-08-01' })],
    });
    api.addSnapshot = vi.fn().mockResolvedValue(snapshot({ id: 3, date: '2026-08-05' }));

    await useSnapshotStore.getState().addSnapshot('2026-08-05', 1);

    expect(useSnapshotStore.getState().snapshots.map((s) => s.date)).toEqual([
      '2026-08-10',
      '2026-08-05',
      '2026-08-01',
    ]);
  });
});
