import { create } from 'zustand';
import type { Asset, AssetCategory, AssetCategoryInput, AssetInput } from '../types';
import { getApi } from '../lib/api';
import { reportError } from '../app/reportError';

// ---------------------------------------------------------------------------
// Asset categories and holdings in ONE store.
//
// They are never useful apart: rendering a holding requires its category's field
// definitions, and every view loads both together. Two stores would mean two
// resets, two loading flags, and a window where a holding is on screen before
// the shape that explains it has arrived.
//
// WHY MUTATIONS RETURN boolean
//   reportError already raises the error toast (it is the renderer's single
//   error choke point), so a caller must not raise a second one. What a caller
//   still needs to know is whether to say 「保存しました」 and close the form.
//   A boolean answers exactly that. The alternative in older stores here -- a
//   void action wrapped in try/catch at the call site -- looks like it handles
//   failure but cannot: the store has already swallowed the throw, so the catch
//   never runs and the success toast fires on failure.
// ---------------------------------------------------------------------------

interface AssetState {
  categories: AssetCategory[];
  assets: Asset[];
  loading: boolean;
  reset: () => void;
  fetchAssets: () => Promise<void>;
  addCategory: (input: AssetCategoryInput) => Promise<boolean>;
  updateCategory: (id: number, input: Partial<AssetCategoryInput>) => Promise<boolean>;
  deleteCategory: (id: number) => Promise<boolean>;
  addAsset: (input: AssetInput) => Promise<boolean>;
  updateAsset: (id: number, input: Partial<AssetInput>) => Promise<boolean>;
  deleteAsset: (id: number) => Promise<boolean>;
}

export const useAssetStore = create<AssetState>((set, get) => ({
  categories: [],
  assets: [],
  loading: false,

  /** Cleared on a ledger switch, like every other ledger-scoped store. */
  reset: () => set({ categories: [], assets: [], loading: false }),

  fetchAssets: async () => {
    set({ loading: true });
    try {
      // One await, not two sequential ones: the views need both before they can
      // render anything, so serialising them only adds a round trip.
      const [categories, assets] = await Promise.all([
        getApi().getAssetCategories(),
        getApi().getAssets(),
      ]);
      set({ categories, assets, loading: false });
    } catch (e) {
      set({ loading: false });
      reportError(e);
    }
  },

  addCategory: async (input) => {
    try {
      const category = await getApi().addAssetCategory(input);
      set({ categories: [...get().categories, category] });
      return true;
    } catch (e) {
      reportError(e);
      return false;
    }
  },

  updateCategory: async (id, input) => {
    const prev = get().categories;
    // Optimistic: the row is already on screen, and a field-definition edit is
    // the kind of change a user expects to see land immediately.
    set({ categories: prev.map((c) => (c.id === id ? { ...c, ...input } : c)) });
    try {
      await getApi().updateAssetCategory(id, input);
      return true;
    } catch (e) {
      set({ categories: prev });
      reportError(e);
      return false;
    }
  },

  deleteCategory: async (id) => {
    const prevCategories = get().categories;
    const prevAssets = get().assets;
    // The holdings go with it: the composite foreign key cascades server-side,
    // so leaving them on screen would show rows that no longer exist.
    set({
      categories: prevCategories.filter((c) => c.id !== id),
      assets: prevAssets.filter((a) => a.categoryId !== id),
    });
    try {
      await getApi().deleteAssetCategory(id);
      return true;
    } catch (e) {
      set({ categories: prevCategories, assets: prevAssets });
      reportError(e);
      return false;
    }
  },

  addAsset: async (input) => {
    try {
      const asset = await getApi().addAsset(input);
      set({ assets: [...get().assets, asset] });
      return true;
    } catch (e) {
      reportError(e);
      return false;
    }
  },

  updateAsset: async (id, input) => {
    // NOT optimistic on `fields`: the server drops any value whose definition
    // the category no longer carries, so merging the patch locally could leave a
    // key on screen that was not stored. The server's answer is the truth, and
    // it is one small round trip away.
    try {
      await getApi().updateAsset(id, input);
    } catch (e) {
      reportError(e);
      return false;
    }

    // The write already succeeded, so a failure from here on is a stale LIST,
    // not a lost edit. Reporting it as a failure would send the user back to
    // redo an edit the server has already stored -- and the next fetch (a
    // ledger switch, a reload) repairs the list on its own.
    //
    // Swallowed rather than reported, deliberately: the caller is about to say
    // 「更新しました」, which is true. Raising an error toast beside it would
    // put two contradictory messages on screen for a problem the user cannot
    // act on -- the same confusion this store's boolean return exists to end.
    try {
      set({ assets: await getApi().getAssets() });
    } catch {
      // Intentionally ignored; see above.
    }
    return true;
  },

  deleteAsset: async (id) => {
    const prev = get().assets;
    set({ assets: prev.filter((a) => a.id !== id) });
    try {
      await getApi().deleteAsset(id);
      return true;
    } catch (e) {
      set({ assets: prev });
      reportError(e);
      return false;
    }
  },
}));

/** Sum of every holding. The 資産 view's headline figure. */
export function totalAssetValue(assets: readonly Asset[]): number {
  return assets.reduce((sum, asset) => sum + asset.value, 0);
}

/** Holdings of one category, in a stable order. */
export function assetsOfCategory(assets: readonly Asset[], categoryId: number): Asset[] {
  return assets.filter((asset) => asset.categoryId === categoryId);
}
