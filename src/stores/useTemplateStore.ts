import { create } from 'zustand';
import type { EntryTemplate, EntryTemplateInput } from '../types';

interface TemplateState {
  templates: EntryTemplate[];
  loading: boolean;
  error: string | null;
  fetchTemplates: () => Promise<void>;
  addTemplate: (input: EntryTemplateInput) => Promise<void>;
  updateTemplate: (id: number, input: Partial<EntryTemplateInput>) => Promise<void>;
  deleteTemplate: (id: number) => Promise<void>;
  toggleTemplate: (id: number, enabled: boolean) => Promise<void>;
}

export const useTemplateStore = create<TemplateState>((set, get) => ({
  templates: [],
  loading: false,
  error: null,

  fetchTemplates: async () => {
    set({ loading: true, error: null });
    try {
      const templates = await window.electronAPI.getTemplates();
      set({ templates, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  addTemplate: async (input: EntryTemplateInput) => {
    try {
      const template = await window.electronAPI.addTemplate(input);
      set({ templates: [...get().templates, template] });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  updateTemplate: async (id: number, input: Partial<EntryTemplateInput>) => {
    const prev = get().templates;
    // optimistic update
    set({
      templates: prev.map((t) =>
        t.id === id ? { ...t, ...input, updatedAt: new Date().toISOString() } : t
      ),
    });
    try {
      await window.electronAPI.updateTemplate(id, input);
    } catch (e) {
      set({ templates: prev, error: (e as Error).message });
    }
  },

  deleteTemplate: async (id: number) => {
    const prev = get().templates;
    // optimistic removal
    set({ templates: prev.filter((t) => t.id !== id) });
    try {
      await window.electronAPI.deleteTemplate(id);
    } catch (e) {
      set({ templates: prev, error: (e as Error).message });
    }
  },

  toggleTemplate: async (id: number, enabled: boolean) => {
    const prev = get().templates;
    // optimistic toggle
    set({
      templates: prev.map((t) =>
        t.id === id ? { ...t, enabled, updatedAt: new Date().toISOString() } : t
      ),
    });
    try {
      await window.electronAPI.toggleTemplate(id, enabled);
    } catch (e) {
      set({ templates: prev, error: (e as Error).message });
    }
  },
}));
