import type { Asset, AssetCategory } from '../types';

// ---------------------------------------------------------------------------
// Shared builders for the asset shapes.
//
// Every test that touches assets used to declare its own local factory. When
// `kind` was added to AssetCategory that meant eight files to edit for one field
// -- and, worse, eight independent opinions about what a default category looks
// like. A test that quietly disagrees with the others is how a suite ends up
// green while the app is wrong.
//
// Add a field to the contract, add it here once.
// ---------------------------------------------------------------------------

/** An ordinary (non-cash) category. */
export function makeAssetCategory(overrides: Partial<AssetCategory> = {}): AssetCategory {
  return {
    id: 1,
    name: 'NISA',
    color: '#22c55e',
    sortOrder: 0,
    fields: [],
    kind: null,
    ...overrides,
  };
}

/**
 * THE cash category -- the one whose holdings are 現在の残高.
 *
 * A separate builder rather than `makeAssetCategory({ kind: 'cash' })` at each
 * call site, because a test that forgets `kind` does not fail: it silently
 * asserts about a ledger with no balance, which is a state the server never
 * produces.
 */
const CASH_CATEGORY_ID = 100;

export function makeCashCategory(overrides: Partial<AssetCategory> = {}): AssetCategory {
  return makeAssetCategory({
    id: CASH_CATEGORY_ID,
    name: '現金',
    color: '#38bdf8',
    sortOrder: -1,
    kind: 'cash',
    ...overrides,
  });
}

export function makeAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: 1,
    categoryId: 1,
    name: 'つみたて',
    value: 1_000_000,
    fields: {},
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

/**
 * A cash holding, attached to makeCashCategory()'s id by default.
 *
 * THE TWO IDS ARE THE SAME CONSTANT ON PURPOSE. A test that overrides one --
 * `makeCashCategory({ id: 5 })` beside a plain `makeCashAsset()` -- gets a
 * holding in no category, which reads as "the balance is ¥0" and asserts about
 * a ledger the server never produces. Override both, or neither.
 */
export function makeCashAsset(overrides: Partial<Asset> = {}): Asset {
  return makeAsset({
    id: 900,
    categoryId: CASH_CATEGORY_ID,
    name: '口座残高',
    value: 500_000,
    ...overrides,
  });
}
