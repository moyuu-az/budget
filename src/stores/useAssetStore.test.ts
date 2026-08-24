import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { assetsOfCategory, totalAssetValue, useAssetStore } from './useAssetStore';
import { useToastStore } from './useToastStore';
import { setApi } from '../lib/api';
import { createMockApi } from '../test/mock-api';
import type { Asset, AssetCategory, AppApi } from '../types';

const makeCategory = (overrides: Partial<AssetCategory> = {}): AssetCategory => ({
  id: 1,
  name: 'NISA',
  color: '#22c55e',
  sortOrder: 0,
  fields: [{ key: 'f1', label: '銘柄', type: 'text', required: true, unit: null }],
  ...overrides,
});

const makeAsset = (overrides: Partial<Asset> = {}): Asset => ({
  id: 1,
  categoryId: 1,
  name: 'つみたて投資枠',
  value: 1_000_000,
  fields: { f1: 'eMAXIS Slim' },
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...overrides,
});

let api: AppApi;

beforeEach(() => {
  api = createMockApi();
  setApi(api);
  useAssetStore.setState({ categories: [], assets: [], loading: false });
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
    expect(useAssetStore.getState().loading).toBe(false);
  });

  it('clears loading and reports the failure once', async () => {
    api.getAssetCategories = vi.fn().mockRejectedValue(new Error('boom'));

    await useAssetStore.getState().fetchAssets();

    expect(useAssetStore.getState().loading).toBe(false);
    expect(useToastStore.getState().toasts).toHaveLength(1);
    expect(useToastStore.getState().toasts[0].type).toBe('error');
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

  it('rolls back to the previous list when the update fails', async () => {
    const before = [makeAsset({ id: 1, name: '更新前' })];
    useAssetStore.setState({ assets: before });
    api.updateAsset = vi.fn().mockRejectedValue(new Error('boom'));

    await expect(useAssetStore.getState().updateAsset(1, { name: 'x' })).resolves.toBe(false);
    expect(useAssetStore.getState().assets).toEqual(before);
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
    useAssetStore.setState({ categories: [makeCategory()], assets: [makeAsset()], loading: true });
    useAssetStore.getState().reset();
    expect(useAssetStore.getState()).toMatchObject({ categories: [], assets: [], loading: false });
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
