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
  /**
   * True once a fetch has SUCCEEDED for the active ledger.
   *
   * Distinct from `!loading`, and the distinction is load-bearing. The cash
   * category's holdings are 現在の残高, so before the first fetch lands this
   * store reports a balance of ¥0 -- and a ¥0 balance combined with the (already
   * loaded) expense templates projects straight into 残高不足, which the
   * dashboard was showing in red on every cold load.
   *
   * An empty `categories` array cannot stand in for this: every ledger has a
   * cash category, so "empty" and "not loaded yet" look identical, and reading
   * one as the other is how a real ¥0 balance would be hidden instead.
   */
  loaded: boolean;
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
  loaded: false,

  /**
   * Cleared on a ledger switch, like every other ledger-scoped store.
   *
   * `loaded` goes back to false with the data: the next ledger's balance is
   * unknown until its own fetch lands, and treating the previous answer as
   * still valid is what would let one household's figures brief the other's
   * screen.
   */
  reset: () => set({ categories: [], assets: [], loading: false, loaded: false }),

  fetchAssets: async () => {
    set({ loading: true });
    try {
      // One await, not two sequential ones: the views need both before they can
      // render anything, so serialising them only adds a round trip.
      const [categories, assets] = await Promise.all([
        getApi().getAssetCategories(),
        getApi().getAssets(),
      ]);
      set({ categories, assets, loading: false, loaded: true });
    } catch (e) {
      // `loaded` stays false: a failed fetch leaves the balance unknown, and
      // the dashboard must keep saying so rather than forecast from ¥0.
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
    //
    // HOLDINGS ONLY -- categories are deliberately left alone.
    //
    // Refetching both looks safer and is not: the category list would overwrite
    // an optimistic rename that another save has in flight, and updateCategory
    // has already returned, so nothing would put it back until the next full
    // load. Trading a visible-and-explained gap for a silently reverted edit is
    // the wrong way round.
    //
    // The gap it leaves -- a holding whose category this client has not fetched,
    // because the other member of a shared ledger added it -- is handled where
    // it is visible instead: summarizeHoldings reports it as その他 rather than
    // letting the parts quietly fail to add up.
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

/** Holdings of one category, in a stable order. */
export function assetsOfCategory(assets: readonly Asset[], categoryId: number): Asset[] {
  return assets.filter((asset) => asset.categoryId === categoryId);
}
