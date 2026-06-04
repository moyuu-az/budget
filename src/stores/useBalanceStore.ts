import { create } from 'zustand';
import { getIpc } from '../lib/ipc';
import { reportError } from '../app/reportError';

interface BalanceState {
  balance: number;
  loading: boolean;
  fetchBalance: () => Promise<void>;
  setBalance: (balance: number) => Promise<void>;
}

export const useBalanceStore = create<BalanceState>((set, get) => ({
  balance: 0,
  loading: false,

  fetchBalance: async () => {
    set({ loading: true });
    try {
      const balance = await getIpc().getBalance();
      set({ balance, loading: false });
    } catch (e) {
      set({ loading: false });
      reportError(e);
    }
  },

  setBalance: async (balance: number) => {
    const prev = get().balance;
    set({ balance }); // optimistic
    try {
      await getIpc().setBalance(balance);
    } catch (e) {
      set({ balance: prev });
      reportError(e);
    }
  },
}));
