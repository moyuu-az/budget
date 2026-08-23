import { create } from 'zustand';
import type { Category, CategoryInput } from '../types';
import { getApi } from '../lib/api';
import { reportError } from '../app/reportError';

interface CategoryState {
  categories: Category[];
  loading: boolean;
  reset: () => void;
  fetchCategories: () => Promise<void>;
  addCategory: (input: CategoryInput) => Promise<void>;
  updateCategory: (id: number, input: Partial<CategoryInput>) => Promise<void>;
  deleteCategory: (id: number) => Promise<void>;
}

export const useCategoryStore = create<CategoryState>((set, get) => ({
  categories: [],
  loading: false,

  /**
   * Clears everything this store holds.
   *
   * Called when the active ledger changes. Without it the previous ledger's
   * numbers would stay on screen under the new ledger's name until each fetch
   * came back -- brief, but a household budget showing someone else's figures
   * even for a moment is not acceptable.
   */
  reset: () => set({ categories: [], loading: false }),

  fetchCategories: async () => {
    set({ loading: true });
    try {
      const categories = await getApi().getCategories();
      set({ categories, loading: false });
    } catch (e) {
      set({ loading: false });
      reportError(e);
    }
  },

  addCategory: async (input: CategoryInput) => {
    try {
      const category = await getApi().addCategory(input);
      set({ categories: [...get().categories, category] });
    } catch (e) {
      reportError(e);
    }
  },

  updateCategory: async (id: number, input: Partial<CategoryInput>) => {
    const prev = get().categories;
    // optimistic update
    set({
      categories: prev.map((c) => (c.id === id ? { ...c, ...input } : c)),
    });
    try {
      await getApi().updateCategory(id, input);
    } catch (e) {
      set({ categories: prev });
      reportError(e);
    }
  },

  deleteCategory: async (id: number) => {
    const prev = get().categories;
    // optimistic removal
    set({ categories: prev.filter((c) => c.id !== id) });
    try {
      await getApi().deleteCategory(id);
    } catch (e) {
      set({ categories: prev });
      reportError(e);
    }
  },
}));
