import { create } from 'zustand';
import type { Category, CategoryInput } from '../types';
import { getApi } from '../lib/api';
import { reportError } from '../app/reportError';
import { applyIfCurrent, currentGeneration, isCurrent } from '../app/ledger-generation';

interface CategoryState {
  categories: Category[];
  loading: boolean;
  reset: () => void;
  fetchCategories: () => Promise<void>;
  // Mutations answer whether the change stuck.
  //
  // reportError already raised the error toast -- it is the renderer's single
  // error choke point -- so the caller must not raise another. What the caller
  // still needs is whether to say 「保存しました」 and close its form, and a
  // try/catch at the call site cannot tell it: the store swallowed the throw, so
  // the catch never runs and the success toast fires even on failure. That was a
  // real bug in CategoryManager before this returned anything.
  addCategory: (input: CategoryInput) => Promise<boolean>;
  updateCategory: (id: number, input: Partial<CategoryInput>) => Promise<boolean>;
  deleteCategory: (id: number) => Promise<boolean>;
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
    // Tagged before the request, checked after: a ledger switch in between makes
    // this answer belong to a ledger nobody is looking at. See
    // src/app/ledger-generation.ts.
    const tag = currentGeneration();
    set({ loading: true });
    try {
      const categories = await getApi().getCategories();
      applyIfCurrent(tag, () => set({ categories, loading: false }));
    } catch (e) {
      applyIfCurrent(tag, () => {
        set({ loading: false });
        reportError(e);
      });
    }
  },

  addCategory: async (input: CategoryInput) => {
    // Tagged before the request; see src/app/ledger-generation.ts.
    const tag = currentGeneration();
    try {
      const category = await getApi().addCategory(input);
      return applyIfCurrent(tag, () => set({ categories: [...get().categories, category] }));
    } catch (e) {
      applyIfCurrent(tag, () => reportError(e));
      return false;
    }
  },

  updateCategory: async (id: number, input: Partial<CategoryInput>) => {
    const prev = get().categories;
    // optimistic update
    set({
      categories: prev.map((c) => (c.id === id ? { ...c, ...input } : c)),
    });
    const tag = currentGeneration();
    try {
      await getApi().updateCategory(id, input);
      return isCurrent(tag);
    } catch (e) {
      // Tagged before the request; see src/app/ledger-generation.ts. Rolling an
      // optimistic edit back onto an array that a ledger switch has already
      // replaced would splice the previous household's row into this one's list.
      applyIfCurrent(tag, () => {
        set({ categories: prev });
        reportError(e);
      });
      return false;
    }
  },

  deleteCategory: async (id: number) => {
    const prev = get().categories;
    // optimistic removal
    set({ categories: prev.filter((c) => c.id !== id) });
    const tag = currentGeneration();
    try {
      await getApi().deleteCategory(id);
      return isCurrent(tag);
    } catch (e) {
      // Tagged before the request; see src/app/ledger-generation.ts. Rolling an
      // optimistic edit back onto an array that a ledger switch has already
      // replaced would splice the previous household's row into this one's list.
      applyIfCurrent(tag, () => {
        set({ categories: prev });
        reportError(e);
      });
      return false;
    }
  },
}));
