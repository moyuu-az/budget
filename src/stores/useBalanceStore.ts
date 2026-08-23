import { create } from 'zustand';
import { getApi } from '../lib/api';
import { reportError } from '../app/reportError';

interface BalanceState {
  balance: number;
  loading: boolean;
  reset: () => void;
  fetchBalance: () => Promise<void>;
  setBalance: (balance: number) => Promise<void>;
}

export const useBalanceStore = create<BalanceState>((set, get) => ({
  balance: 0,
  loading: false,

  /**
   * Clears everything this store holds.
   *
   * Called when the active ledger changes. Without it the previous ledger's
   * numbers would stay on screen under the new ledger's name until each fetch
   * came back -- brief, but a household budget showing someone else's figures
   * even for a moment is not acceptable.
   */
  reset: () => set({ balance: 0, loading: false }),

  fetchBalance: async () => {
    set({ loading: true });
    try {
      const balance = await getApi().getBalance();
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
      await getApi().setBalance(balance);
    } catch (e) {
      set({ balance: prev });
      reportError(e);
    }
  },
}));
