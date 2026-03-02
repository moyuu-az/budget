import { create } from 'zustand';
import type { Category, CategoryInput } from '../types';

interface CategoryState {
  categories: Category[];
  loading: boolean;
  error: string | null;
  fetchCategories: () => Promise<void>;
  addCategory: (input: CategoryInput) => Promise<void>;
  updateCategory: (id: number, input: Partial<CategoryInput>) => Promise<void>;
  deleteCategory: (id: number) => Promise<void>;
}

export const useCategoryStore = create<CategoryState>((set, get) => ({
  categories: [],
  loading: false,
  error: null,

  fetchCategories: async () => {
    set({ loading: true, error: null });
    try {
      const categories = await window.electronAPI.getCategories();
      set({ categories, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  addCategory: async (input: CategoryInput) => {
    try {
      const category = await window.electronAPI.addCategory(input);
      set({ categories: [...get().categories, category] });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  updateCategory: async (id: number, input: Partial<CategoryInput>) => {
    const prev = get().categories;
    // optimistic update
    set({
      categories: prev.map((c) =>
        c.id === id ? { ...c, ...input } : c
      ),
    });
    try {
      await window.electronAPI.updateCategory(id, input);
    } catch (e) {
      set({ categories: prev, error: (e as Error).message });
    }
  },

  deleteCategory: async (id: number) => {
    const prev = get().categories;
    // optimistic removal
    set({ categories: prev.filter((c) => c.id !== id) });
    try {
      await window.electronAPI.deleteCategory(id);
    } catch (e) {
      set({ categories: prev, error: (e as Error).message });
    }
  },
}));
