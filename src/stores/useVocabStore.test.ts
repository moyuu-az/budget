import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setApi } from '../lib/api';
import { createMockApi } from '../test/mock-api';
import { useVocabStore } from './useVocabStore';
import { useToastStore } from './useToastStore';
import type { AppApi, VocabProgress } from '../types';

const PROGRESS: VocabProgress = [
  {
    wordId: 'et-481',
    byDirection: {
      en_to_ja: { attempts: 1, correct: 1, lastCorrect: true, lastAnsweredAt: '2026-09-05T00:00:00.000Z' },
      ja_to_en: { attempts: 0, correct: 0, lastCorrect: null, lastAnsweredAt: null },
    },
  },
];

let api: AppApi;

beforeEach(() => {
  api = createMockApi();
  setApi(api);
  useVocabStore.setState({ progress: [], status: 'idle', saving: false });
  useToastStore.setState({ toasts: [], queue: [] });
});

afterEach(() => {
  setApi(null);
  vi.restoreAllMocks();
});

describe('useVocabStore', () => {
  it('loads the record and reports ready', async () => {
    vi.mocked(api.getVocabProgress).mockResolvedValue(PROGRESS);
    await useVocabStore.getState().fetchProgress();
    expect(useVocabStore.getState()).toMatchObject({ progress: PROGRESS, status: 'ready' });
  });

  it("reports 'error' rather than an empty record when the fetch fails", async () => {
    // An empty record and a failed fetch look identical on screen ("you have not
    // started"), and one of the two is a lie the reader would act on by
    // re-answering words they had already learned.
    vi.mocked(api.getVocabProgress).mockRejectedValue(new Error('offline'));
    await useVocabStore.getState().fetchProgress();
    expect(useVocabStore.getState().status).toBe('error');
    expect(useVocabStore.getState().progress).toEqual([]);
  });

  it("takes the server's answer as the new record rather than folding it in itself", async () => {
    // There is one implementation of "how many did I get right" -- the SQL
    // behind getVocabProgress. A second one here would eventually disagree, and
    // the reader watching their accuracy would have no way to tell which figure
    // was wrong.
    vi.mocked(api.recordVocabAttempts).mockResolvedValue(PROGRESS);
    const ok = await useVocabStore
      .getState()
      .recordAttempts([{ wordId: 'et-481', direction: 'en_to_ja', correct: true }]);

    expect(ok).toBe(true);
    expect(useVocabStore.getState().progress).toEqual(PROGRESS);
    expect(useVocabStore.getState().saving).toBe(false);
  });

  it('answers false when the run could not be recorded, and leaves the record alone', async () => {
    // The results screen uses this to say so. Reporting success would let the
    // reader move on believing 「間違えた問題だけ」 had been updated with the
    // words they just got wrong.
    useVocabStore.setState({ progress: PROGRESS, status: 'ready' });
    vi.mocked(api.recordVocabAttempts).mockRejectedValue(new Error('offline'));

    const ok = await useVocabStore
      .getState()
      .recordAttempts([{ wordId: 'et-481', direction: 'en_to_ja', correct: false }]);

    expect(ok).toBe(false);
    expect(useVocabStore.getState().progress).toEqual(PROGRESS);
    expect(useVocabStore.getState().saving).toBe(false);
  });

  it('passes the Day straight through to the server, including null for "all"', async () => {
    vi.mocked(api.resetVocabProgress).mockResolvedValue([]);
    await useVocabStore.getState().resetProgress(31);
    await useVocabStore.getState().resetProgress(null);
    expect(api.resetVocabProgress).toHaveBeenNthCalledWith(1, 31);
    expect(api.resetVocabProgress).toHaveBeenNthCalledWith(2, null);
  });

  it('is NOT one of the stores a ledger switch clears', async () => {
    // The record belongs to the person, not the household. Clearing it on a
    // switch would blank 英単語 every time somebody looked at their private
    // budget -- and the refetch would return exactly what was thrown away.
    const { resetLedgerData } = await import('../app/ledger');
    useVocabStore.setState({ progress: PROGRESS, status: 'ready' });
    resetLedgerData();
    expect(useVocabStore.getState().progress).toEqual(PROGRESS);
    expect(useVocabStore.getState().status).toBe('ready');
  });
});
