import { create } from 'zustand';
import type { EntryTemplate, EntryTemplateInput } from '../types';
import { getApi } from '../lib/api';
import { reportError } from '../app/reportError';

interface TemplateState {
  templates: EntryTemplate[];
  loading: boolean;
  fetchTemplates: () => Promise<void>;
  addTemplate: (input: EntryTemplateInput) => Promise<void>;
  updateTemplate: (id: number, input: Partial<EntryTemplateInput>) => Promise<void>;
  deleteTemplate: (id: number) => Promise<void>;
  toggleTemplate: (id: number, enabled: boolean) => Promise<void>;
}

export const useTemplateStore = create<TemplateState>((set, get) => ({
  templates: [],
  loading: false,

  fetchTemplates: async () => {
    set({ loading: true });
    try {
      const templates = await getApi().getTemplates();
      set({ templates, loading: false });
    } catch (e) {
      set({ loading: false });
      reportError(e);
    }
  },

  addTemplate: async (input: EntryTemplateInput) => {
    try {
      const template = await getApi().addTemplate(input);
      set({ templates: [...get().templates, template] });
    } catch (e) {
      reportError(e);
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
      await getApi().updateTemplate(id, input);
    } catch (e) {
      set({ templates: prev });
      reportError(e);
    }
  },

  deleteTemplate: async (id: number) => {
    const prev = get().templates;
    // optimistic removal
    set({ templates: prev.filter((t) => t.id !== id) });
    try {
      await getApi().deleteTemplate(id);
    } catch (e) {
      set({ templates: prev });
      reportError(e);
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
      await getApi().toggleTemplate(id, enabled);
    } catch (e) {
      set({ templates: prev });
      reportError(e);
    }
  },
}));
