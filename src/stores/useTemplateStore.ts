import { create } from 'zustand';
import type { EntryTemplate, EntryTemplateInput } from '../types';
import { getApi } from '../lib/api';
import { reportError } from '../app/reportError';
import { useMonthlyStore } from './useMonthlyStore';
import type { LoadStatus } from './load-status';

// ---------------------------------------------------------------------------
// WHY THE MUTATIONS RETURN boolean
//
//   reportError already raises the error toast -- it is the renderer's single
//   error choke point -- so a caller must not raise a second one. What a caller
//   still needs to know is whether to say 「保存しました」 and close the form.
//
//   These actions used to return void and swallow the throw, and every call site
//   wrapped them in try/catch. That try/catch CANNOT RUN: the store has already
//   caught the error, so the success toast fires on failure, beside the error
//   toast, with the form closing as though the change had been stored. Someone
//   whose save failed is told it worked.
//
//   The asset store learned this first (see useAssetStore.ts); this brings the
//   template store into step, because recurrence gives the server new grounds to
//   reject a save and makes the false success easier to reach.
// ---------------------------------------------------------------------------

interface TemplateState {
  templates: EntryTemplate[];
  /**
   * Where the fetch for the ACTIVE ledger has got to.
   *
   * The forecast needs these as much as it needs the balance; see
   * src/hooks/useForecast.ts for why a projection is not shown until both have
   * arrived, and why a failure must not look like a wait.
   */
  status: LoadStatus;
  reset: () => void;
  fetchTemplates: () => Promise<void>;
  addTemplate: (input: EntryTemplateInput) => Promise<boolean>;
  updateTemplate: (id: number, input: Partial<EntryTemplateInput>) => Promise<boolean>;
  deleteTemplate: (id: number) => Promise<boolean>;
  toggleTemplate: (id: number, enabled: boolean) => Promise<boolean>;
}

export const useTemplateStore = create<TemplateState>((set, get) => ({
  templates: [],
  status: 'idle',

  /**
   * Clears everything this store holds.
   *
   * Called when the active ledger changes. Without it the previous ledger's
   * numbers would stay on screen under the new ledger's name until each fetch
   * came back -- brief, but a household budget showing someone else's figures
   * even for a moment is not acceptable.
   */
  reset: () => set({ templates: [], status: 'idle' }),

  fetchTemplates: async () => {
    set({ status: 'loading' });
    try {
      const templates = await getApi().getTemplates();
      set({ templates, status: 'ready' });
    } catch (e) {
      set({ status: 'error' });
      reportError(e);
    }
  },

  addTemplate: async (input: EntryTemplateInput) => {
    try {
      const template = await getApi().addTemplate(input);
      set({ templates: [...get().templates, template] });
      return true;
    } catch (e) {
      reportError(e);
      return false;
    }
  },

  updateTemplate: async (id: number, input: Partial<EntryTemplateInput>) => {
    const prev = get().templates;
    // Optimistic. `input.recurrence` is a whole object, so the spread REPLACES
    // the timing rather than merging into it -- a half-merged union would be a
    // shape neither the predicates nor the database accept.
    set({
      templates: prev.map((t) =>
        t.id === id ? { ...t, ...input, updatedAt: new Date().toISOString() } : t
      ),
    });
    try {
      await getApi().updateTemplate(id, input);

      // A recurrence change deletes the per-month amounts it no longer covers,
      // SERVER-SIDE, in the same transaction. The cache has to follow, or the
      // totals go on using a figure the database no longer holds -- and a reload
      // would change the numbers, which is the screen lying about what is saved.
      if (input.recurrence !== undefined) {
        useMonthlyStore.getState().forgetAmountsOutside(id, input.recurrence);
      }
      return true;
    } catch (e) {
      set({ templates: prev });
      reportError(e);
      return false;
    }
  },

  deleteTemplate: async (id: number) => {
    const prev = get().templates;
    // optimistic removal
    set({ templates: prev.filter((t) => t.id !== id) });
    try {
      await getApi().deleteTemplate(id);
      return true;
    } catch (e) {
      set({ templates: prev });
      reportError(e);
      return false;
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
      return true;
    } catch (e) {
      set({ templates: prev });
      reportError(e);
      return false;
    }
  },
}));
