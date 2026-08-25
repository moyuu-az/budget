import { create } from 'zustand';
import type { BalanceSnapshot } from '../types';
import { getApi } from '../lib/api';
import { reportError } from '../app/reportError';

interface SnapshotState {
  snapshots: BalanceSnapshot[];
  loading: boolean;
  reset: () => void;
  fetchSnapshots: () => Promise<void>;
  /**
   * Records a balance for a date. Resolves to whether it was stored.
   *
   * WHY A boolean AND NOT A THROW
   *   reportError already raises the error toast (it is the renderer's single
   *   error choke point), so a caller must not raise a second one -- but it
   *   still has to know whether to say 「記録しました」 and close the form.
   *
   *   This used to return void and swallow the throw, which made the try/catch
   *   at the call site LOOK like it handled failure while being unreachable:
   *   the success toast fired on failure, beside the error toast, and the form
   *   closed as if the record had been saved. Same rule as useAssetStore.
   */
  addSnapshot: (date: string, balance: number) => Promise<boolean>;
  deleteSnapshot: (id: number) => Promise<void>;
}

export const useSnapshotStore = create<SnapshotState>((set, get) => ({
  snapshots: [],
  loading: false,

  /**
   * Clears everything this store holds.
   *
   * Called when the active ledger changes. Without it the previous ledger's
   * numbers would stay on screen under the new ledger's name until each fetch
   * came back -- brief, but a household budget showing someone else's figures
   * even for a moment is not acceptable.
   */
  reset: () => set({ snapshots: [], loading: false }),

  fetchSnapshots: async () => {
    set({ loading: true });
    try {
      const snapshots = await getApi().getSnapshots();
      set({ snapshots, loading: false });
    } catch (e) {
      set({ loading: false });
      reportError(e);
    }
  },

  addSnapshot: async (date: string, balance: number) => {
    try {
      const snapshot = await getApi().addSnapshot(date, balance);
      // REPLACE, do not append. The server upserts on (ledger, date), so
      // recording the same day twice returns the SAME row -- appending it put
      // two elements with one id into the list, which React renders as duplicate
      // keys and the user reads as two records of one day.
      const rest = get().snapshots.filter((s) => s.id !== snapshot.id && s.date !== snapshot.date);
      // Newest first, matching what getSnapshots returns; otherwise the new row
      // lands at the bottom of a descending list until the next fetch.
      set({ snapshots: [...rest, snapshot].sort((a, b) => b.date.localeCompare(a.date)) });
      return true;
    } catch (e) {
      reportError(e);
      return false;
    }
  },

  deleteSnapshot: async (id: number) => {
    const prev = get().snapshots;
    // optimistic removal
    set({ snapshots: prev.filter((s) => s.id !== id) });
    try {
      await getApi().deleteSnapshot(id);
    } catch (e) {
      set({ snapshots: prev });
      reportError(e);
    }
  },
}));
