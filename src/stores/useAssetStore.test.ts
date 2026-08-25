import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { assetsOfCategory, useAssetStore } from './useAssetStore';
import { totalAssetValue } from '../utils/net-worth';
import { useToastStore } from './useToastStore';
import { setApi } from '../lib/api';
import { createMockApi } from '../test/mock-api';
import {
  makeAsset as makeBaseAsset,
  makeAssetCategory,
} from '../test/factories';
import type { Asset, AssetCategory, AppApi } from '../types';

const makeCategory = (overrides: Partial<AssetCategory> = {}): AssetCategory =>
  makeAssetCategory({
    fields: [{ key: 'f1', label: '銘柄', type: 'text', required: true, unit: null }],
    ...overrides,
  });

const makeAsset = (overrides: Partial<Asset> = {}): Asset =>
  makeBaseAsset({ name: 'つみたて投資枠', fields: { f1: 'eMAXIS Slim' }, ...overrides });

let api: AppApi;

beforeEach(() => {
  api = createMockApi();
  setApi(api);
  useAssetStore.setState({ categories: [], assets: [], status: 'ready' });
  useToastStore.setState({ toasts: [], queue: [] });
});

afterEach(() => {
  setApi(null);
  vi.restoreAllMocks();
});

describe('fetchAssets', () => {
  it('loads categories and holdings together', async () => {
    // They are never useful apart: a holding cannot be rendered without the
    // field definitions that explain it.
    api.getAssetCategories = vi.fn().mockResolvedValue([makeCategory()]);
    api.getAssets = vi.fn().mockResolvedValue([makeAsset()]);

    await useAssetStore.getState().fetchAssets();

    expect(useAssetStore.getState().categories).toHaveLength(1);
    expect(useAssetStore.getState().assets).toHaveLength(1);
    expect(useAssetStore.getState().status).toBe('ready');
  });

  it('records the failure as its own state, and reports it once', async () => {
    api.getAssetCategories = vi.fn().mockRejectedValue(new Error('boom'));

    await useAssetStore.getState().fetchAssets();

    // 'error', not back to 'idle'. Folded into "not loaded yet" this becomes a
    // dashboard skeleton that pulses forever, with nothing saying what happened
    // and no way to try again short of reloading the page.
    expect(useAssetStore.getState().status).toBe('error');
    expect(useToastStore.getState().toasts).toHaveLength(1);
    expect(useToastStore.getState().toasts[0].type).toBe('error');
  });

  it('leaves nothing half-loaded when only one of the two reads fails', async () => {
    // Holdings without their category's definitions cannot be rendered, so a
    // partial result is worse than none.
    api.getAssetCategories = vi.fn().mockResolvedValue([makeCategory()]);
    api.getAssets = vi.fn().mockRejectedValue(new Error('boom'));

    await useAssetStore.getState().fetchAssets();

    expect(useAssetStore.getState().categories).toEqual([]);
    expect(useAssetStore.getState().assets).toEqual([]);
    expect(useAssetStore.getState().status).toBe('error');
  });

  it('recovers when a retry succeeds', async () => {
    // The retry the dashboard offers on failure has to be able to clear the
    // error, or the button is decoration.
    api.getAssetCategories = vi.fn().mockRejectedValue(new Error('boom'));
    await useAssetStore.getState().fetchAssets();
    expect(useAssetStore.getState().status).toBe('error');

    api.getAssetCategories = vi.fn().mockResolvedValue([makeCategory()]);
    api.getAssets = vi.fn().mockResolvedValue([makeAsset()]);
    await useAssetStore.getState().fetchAssets();

    expect(useAssetStore.getState().status).toBe('ready');
    expect(useAssetStore.getState().categories).toHaveLength(1);
  });
});

describe('mutations report success as a boolean', () => {
  it('returns true and appends the created category', async () => {
    const created = makeCategory({ id: 7 });
    api.addAssetCategory = vi.fn().mockResolvedValue(created);

    await expect(useAssetStore.getState().addCategory({ name: 'NISA' })).resolves.toBe(true);
    expect(useAssetStore.getState().categories).toEqual([created]);
  });

  it('returns false and raises exactly one toast on failure', async () => {
    // The caller must not add a second toast of its own -- reportError inside
    // the store is the renderer's single error choke point.
    api.addAssetCategory = vi.fn().mockRejectedValue(new Error('boom'));

    await expect(useAssetStore.getState().addCategory({ name: 'NISA' })).resolves.toBe(false);
    expect(useToastStore.getState().toasts).toHaveLength(1);
  });
});

describe('deleteCategory', () => {
  it('removes the category and its holdings, matching the cascade on the server', async () => {
    useAssetStore.setState({
      categories: [makeCategory({ id: 1 }), makeCategory({ id: 2, name: '現金' })],
      assets: [makeAsset({ id: 1, categoryId: 1 }), makeAsset({ id: 2, categoryId: 2 })],
    });
    api.deleteAssetCategory = vi.fn().mockResolvedValue(undefined);

    await useAssetStore.getState().deleteCategory(1);

    expect(useAssetStore.getState().categories.map((c) => c.id)).toEqual([2]);
    // Leaving them on screen would show rows the database no longer has.
    expect(useAssetStore.getState().assets.map((a) => a.id)).toEqual([2]);
  });

  it('restores BOTH lists when the delete fails', async () => {
    const categories = [makeCategory({ id: 1 })];
    const assets = [makeAsset({ id: 1, categoryId: 1 })];
    useAssetStore.setState({ categories, assets });
    api.deleteAssetCategory = vi.fn().mockRejectedValue(new Error('boom'));

    await expect(useAssetStore.getState().deleteCategory(1)).resolves.toBe(false);
    expect(useAssetStore.getState().categories).toEqual(categories);
    expect(useAssetStore.getState().assets).toEqual(assets);
  });
});

describe('updateAsset', () => {
  it('takes the server\'s answer rather than merging the patch locally', async () => {
    // The server drops values whose definition the category no longer carries,
    // so an optimistic merge could leave a key on screen that was not stored.
    const stored = makeAsset({ id: 1, name: '更新後', fields: { f1: 'A' } });
    useAssetStore.setState({ assets: [makeAsset({ id: 1, name: '更新前', fields: { f1: 'A', f9: '幽霊' } })] });
    api.updateAsset = vi.fn().mockResolvedValue(undefined);
    api.getAssets = vi.fn().mockResolvedValue([stored]);

    await expect(
      useAssetStore.getState().updateAsset(1, { name: '更新後', fields: { f1: 'A' } }),
    ).resolves.toBe(true);
    expect(useAssetStore.getState().assets).toEqual([stored]);
  });

  it('reports a failed write as a failure and leaves the list untouched', async () => {
    const before = [makeAsset({ id: 1, name: '更新前' })];
    useAssetStore.setState({ assets: before });
    api.updateAsset = vi.fn().mockRejectedValue(new Error('boom'));
    api.getAssets = vi.fn();

    await expect(useAssetStore.getState().updateAsset(1, { name: 'x' })).resolves.toBe(false);
    expect(useAssetStore.getState().assets).toEqual(before);
    expect(useToastStore.getState().toasts.map((t) => t.type)).toEqual(['error']);
    // No point refreshing a list nothing changed.
    expect(api.getAssets).not.toHaveBeenCalled();
  });

  it('refreshes the holdings without touching the categories', async () => {
    // Refetching categories here would overwrite an optimistic rename that
    // another save has in flight, and updateCategory has already returned -- so
    // nothing would put it back until the next full load. A holding whose
    // category is missing is reported as その他 instead (see utils/net-worth).
    const renamed = [makeCategory({ id: 1, name: '新NISA' })];
    useAssetStore.setState({ categories: renamed, assets: [makeAsset({ id: 1 })] });
    api.updateAsset = vi.fn().mockResolvedValue(undefined);
    api.getAssets = vi.fn().mockResolvedValue([makeAsset({ id: 1, name: '更新後' })]);
    api.getAssetCategories = vi.fn();

    await useAssetStore.getState().updateAsset(1, { name: '更新後' });

    expect(api.getAssetCategories).not.toHaveBeenCalled();
    expect(useAssetStore.getState().categories).toEqual(renamed);
    expect(useAssetStore.getState().assets[0].name).toBe('更新後');
  });

  it('still reports success when only the refresh fails, and says nothing else', async () => {
    // The write landed. Calling it a failure would send the user back to redo an
    // edit the server has already stored; the stale list repairs itself on the
    // next fetch.
    const before = [makeAsset({ id: 1, name: '更新前' })];
    useAssetStore.setState({ assets: before });
    api.updateAsset = vi.fn().mockResolvedValue(undefined);
    api.getAssets = vi.fn().mockRejectedValue(new Error('network'));

    await expect(useAssetStore.getState().updateAsset(1, { name: '更新後' })).resolves.toBe(true);
    expect(useAssetStore.getState().assets).toEqual(before);
    // No error toast: the caller is about to say 「更新しました」, which is true.
    // Two contradictory messages for something the user cannot act on is the
    // confusion this store's boolean return exists to end.
    expect(useToastStore.getState().toasts).toEqual([]);
  });
});

describe('updateCategory', () => {
  it('merges the patch optimistically', async () => {
    useAssetStore.setState({ categories: [makeCategory({ id: 1, name: 'NISA' })] });
    api.updateAssetCategory = vi.fn().mockResolvedValue(undefined);

    await expect(useAssetStore.getState().updateCategory(1, { name: '新NISA' })).resolves.toBe(true);
    expect(useAssetStore.getState().categories[0].name).toBe('新NISA');
  });

  it('rolls the merge back when the server refuses it', async () => {
    const before = [makeCategory({ id: 1, name: 'NISA' })];
    useAssetStore.setState({ categories: before });
    api.updateAssetCategory = vi.fn().mockRejectedValue(new Error('boom'));

    await expect(useAssetStore.getState().updateCategory(1, { name: '新NISA' })).resolves.toBe(false);
    expect(useAssetStore.getState().categories).toEqual(before);
    expect(useToastStore.getState().toasts.map((t) => t.type)).toEqual(['error']);
  });
});

describe('addAsset', () => {
  it('appends what the server returned, not what was sent', async () => {
    // The server normalises: it coerces numbers and drops undefined parameters.
    const stored = makeAsset({ id: 9, fields: { f1: 'VTI' } });
    api.addAsset = vi.fn().mockResolvedValue(stored);

    await expect(
      useAssetStore.getState().addAsset({ categoryId: 1, name: 'x', value: 1, fields: { f1: 'VTI', f9: '幽霊' } }),
    ).resolves.toBe(true);
    expect(useAssetStore.getState().assets).toEqual([stored]);
  });

  it('adds nothing and reports once when the server refuses', async () => {
    api.addAsset = vi.fn().mockRejectedValue(new Error('boom'));

    await expect(
      useAssetStore.getState().addAsset({ categoryId: 1, name: 'x', value: 1 }),
    ).resolves.toBe(false);
    expect(useAssetStore.getState().assets).toEqual([]);
    expect(useToastStore.getState().toasts).toHaveLength(1);
  });
});

describe('deleteAsset', () => {
  it('rolls the optimistic removal back on failure', async () => {
    const before = [makeAsset({ id: 1 }), makeAsset({ id: 2 })];
    useAssetStore.setState({ assets: before });
    api.deleteAsset = vi.fn().mockRejectedValue(new Error('boom'));

    await expect(useAssetStore.getState().deleteAsset(1)).resolves.toBe(false);
    expect(useAssetStore.getState().assets).toEqual(before);
  });
});

describe('reset', () => {
  it('empties everything, so a ledger switch cannot leave the previous household on screen', () => {
    useAssetStore.setState({
      categories: [makeCategory()],
      assets: [makeAsset()],
      status: 'ready',
    });
    useAssetStore.getState().reset();
    // Back to 'idle', not 'ready': the next ledger's balance is unknown until
    // its own fetch lands, and a stale 'ready' would let the dashboard render
    // ¥0 as a figure during the switch.
    expect(useAssetStore.getState()).toMatchObject({ categories: [], assets: [], status: 'idle' });
  });
});

describe('selectors', () => {
  it('totals every holding, including negative ones', () => {
    // A loan balance tracked as an asset category is entered negative.
    expect(totalAssetValue([makeAsset({ value: 1000 }), makeAsset({ id: 2, value: -400 })])).toBe(600);
  });

  it('filters holdings to one category', () => {
    const assets = [makeAsset({ id: 1, categoryId: 1 }), makeAsset({ id: 2, categoryId: 2 })];
    expect(assetsOfCategory(assets, 2).map((a) => a.id)).toEqual([2]);
  });
});
