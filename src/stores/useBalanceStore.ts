import { create } from 'zustand';

interface BalanceState {
  balance: number;
  loading: boolean;
  error: string | null;
  fetchBalance: () => Promise<void>;
  setBalance: (balance: number) => Promise<void>;
}

export const useBalanceStore = create<BalanceState>((set, get) => ({
  balance: 0,
  loading: false,
  error: null,

  fetchBalance: async () => {
    set({ loading: true, error: null });
    try {
      const balance = await window.electronAPI.getBalance();
      set({ balance, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  setBalance: async (balance: number) => {
    const prev = get().balance;
    set({ balance }); // optimistic
    try {
      await window.electronAPI.setBalance(balance);
    } catch (e) {
      set({ balance: prev, error: (e as Error).message });
    }
  },
}));
