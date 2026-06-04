import { create } from 'zustand';
import type { Category, CategoryInput } from '../types';
import { getIpc } from '../lib/ipc';
import { reportError } from '../app/reportError';

interface CategoryState {
  categories: Category[];
  loading: boolean;
  fetchCategories: () => Promise<void>;
  addCategory: (input: CategoryInput) => Promise<void>;
  updateCategory: (id: number, input: Partial<CategoryInput>) => Promise<void>;
  deleteCategory: (id: number) => Promise<void>;
}

export const useCategoryStore = create<CategoryState>((set, get) => ({
  categories: [],
  loading: false,

  fetchCategories: async () => {
    set({ loading: true });
    try {
      const categories = await getIpc().getCategories();
      set({ categories, loading: false });
    } catch (e) {
      set({ loading: false });
      reportError(e);
    }
  },

  addCategory: async (input: CategoryInput) => {
    try {
      const category = await getIpc().addCategory(input);
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
      await getIpc().updateCategory(id, input);
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
      await getIpc().deleteCategory(id);
    } catch (e) {
      set({ categories: prev });
      reportError(e);
    }
  },
}));
