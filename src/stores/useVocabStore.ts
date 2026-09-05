import { create } from 'zustand';
import type { VocabAttemptInput, VocabProgress } from '../types';
import { getApi } from '../lib/api';
import { reportError } from '../app/reportError';
import type { LoadStatus } from './load-status';

// ---------------------------------------------------------------------------
// THE STUDY RECORD, AND THE ONE THING THAT MAKES IT UNLIKE EVERY OTHER STORE
// HERE.
//
// IT IS NOT LEDGER-SCOPED, so it is deliberately absent from
// LEDGER_SCOPED_STORES in src/app/ledger.ts. Do not add it there.
//
//   Switching ledgers must NOT clear it. The record belongs to the person, not
//   to the household; wiping it on a switch would blank the 英単語 screen every
//   time somebody looked at their private budget, and refetching would return
//   exactly what was thrown away.
//
//   It also does not need the generation tagging the ledger stores use
//   (src/app/ledger-generation.ts). That machinery exists because a response
//   from the PREVIOUS ledger landing in an emptied store shows one household's
//   figures under another's name. A vocabulary response cannot belong to the
//   wrong ledger, because it never belonged to one.
//
// FETCHED LAZILY, when the screen is opened, rather than in loadLedgerData.
// Nothing outside 英単語 reads it, and the dashboard has no business waiting on
// a quiz record to draw a balance.
// ---------------------------------------------------------------------------

interface VocabState {
  progress: VocabProgress;
  status: LoadStatus;
  /**
   * True while a finished quiz is being written.
   *
   * Separate from `status`, which is about the RECORD being loaded. The results
   * screen needs to say 「記録中」 without pretending the progress it is already
   * showing has gone away.
   */
  saving: boolean;
  fetchProgress: () => Promise<void>;
  /**
   * Records a finished run. Resolves to whether it was stored.
   *
   * WHY A boolean AND NOT A THROW
   *   reportError already raises the error toast (it is the renderer's single
   *   error choke point), so a caller must not raise a second one -- but the
   *   results screen still has to know whether to say 「記録しました」 or to
   *   offer 「もう一度保存」. Same rule as useSnapshotStore and useAssetStore.
   */
  recordAttempts: (attempts: readonly VocabAttemptInput[]) => Promise<boolean>;
  resetProgress: (day: number | null) => Promise<boolean>;
}

export const useVocabStore = create<VocabState>((set) => ({
  progress: [],
  status: 'idle',
  saving: false,

  fetchProgress: async () => {
    set({ status: 'loading' });
    try {
      const progress = await getApi().getVocabProgress();
      set({ progress, status: 'ready' });
    } catch (e) {
      // 'error', not a silent empty list. An empty record and a failed fetch look
      // identical on screen ("you have not started"), and one of the two is a
      // lie the reader would act on by re-answering words they had already
      // learned.
      set({ status: 'error' });
      reportError(e);
    }
  },

  recordAttempts: async (attempts) => {
    set({ saving: true });
    try {
      // THE SERVER'S ANSWER REPLACES THE STORE, rather than the client folding
      // the run into the counts it already had. There is one implementation of
      // "how many did I get right" (the SQL behind getVocabProgress); a second
      // one here would eventually disagree with it, and a reader watching their
      // accuracy is exactly the person who would notice and have no way to tell
      // which figure was wrong.
      const progress = await getApi().recordVocabAttempts(attempts);
      set({ progress, status: 'ready', saving: false });
      return true;
    } catch (e) {
      set({ saving: false });
      reportError(e);
      return false;
    }
  },

  resetProgress: async (day) => {
    try {
      const progress = await getApi().resetVocabProgress(day);
      set({ progress, status: 'ready' });
      return true;
    } catch (e) {
      reportError(e);
      return false;
    }
  },
}));
