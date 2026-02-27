import { create } from 'zustand';
import type { BalanceSnapshot } from '../types';

interface SnapshotState {
  snapshots: BalanceSnapshot[];
  loading: boolean;
  error: string | null;
  fetchSnapshots: () => Promise<void>;
  addSnapshot: (date: string, balance: number) => Promise<void>;
  deleteSnapshot: (id: number) => Promise<void>;
}

export const useSnapshotStore = create<SnapshotState>((set, get) => ({
  snapshots: [],
  loading: false,
  error: null,

  fetchSnapshots: async () => {
    set({ loading: true, error: null });
    try {
      const snapshots = await window.electronAPI.getSnapshots();
      set({ snapshots, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  addSnapshot: async (date: string, balance: number) => {
    try {
      const snapshot = await window.electronAPI.addSnapshot(date, balance);
      set({ snapshots: [...get().snapshots, snapshot] });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  deleteSnapshot: async (id: number) => {
    const prev = get().snapshots;
    // optimistic removal
    set({ snapshots: prev.filter((s) => s.id !== id) });
    try {
      await window.electronAPI.deleteSnapshot(id);
    } catch (e) {
      set({ snapshots: prev, error: (e as Error).message });
    }
  },
}));
