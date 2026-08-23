import { create } from 'zustand';
import type { BalanceSnapshot } from '../types';
import { getApi } from '../lib/api';
import { reportError } from '../app/reportError';

interface SnapshotState {
  snapshots: BalanceSnapshot[];
  loading: boolean;
  fetchSnapshots: () => Promise<void>;
  addSnapshot: (date: string, balance: number) => Promise<void>;
  deleteSnapshot: (id: number) => Promise<void>;
}

export const useSnapshotStore = create<SnapshotState>((set, get) => ({
  snapshots: [],
  loading: false,

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
      set({ snapshots: [...get().snapshots, snapshot] });
    } catch (e) {
      reportError(e);
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
