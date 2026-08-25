import type { Asset, AssetCategory, EntryTemplate, Recurrence } from '../types';

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

// ---------------------------------------------------------------------------
// Recurrence builders.
//
// Migration 005 turned `dayOfMonth: number` into a `Recurrence` union, and the
// tests that had written the number inline were exactly the places that assumed
// every entry is monthly. The helpers below make the common case as short as the
// number used to be, so a test says WHEN something repeats rather than restating
// the union's shape.
//
// `monthlyOn` is a function rather than a constant because the day is what the
// call site is actually asserting about; the other three exist so a test about
// irregular timing reads as one.
// ---------------------------------------------------------------------------

/** Every month, on `dayOfMonth`. What almost every entry is. */
export function monthlyOn(dayOfMonth: number): Recurrence {
  return { kind: 'monthly', dayOfMonth };
}

/** Every year, in `month` (1-12), on `dayOfMonth`. */
export function yearlyOn(month: number, dayOfMonth: number): Recurrence {
  return { kind: 'yearly', month, dayOfMonth };
}

/** Every `everyMonths` months counting from `anchorMonth` ('YYYY-MM'). */
export function intervalOn(everyMonths: number, anchorMonth: string, dayOfMonth: number): Recurrence {
  return { kind: 'interval', everyMonths, anchorMonth, dayOfMonth };
}

/** Exactly once, on `date` ('YYYY-MM-DD'). */
export function onceOn(date: string): Recurrence {
  return { kind: 'once', date };
}

/**
 * A planned entry. Monthly on the 1st unless told otherwise.
 *
 * Note the ORDER: `...overrides` comes last, so a caller passing `recurrence`
 * replaces the default rather than merging into it -- a partially merged union
 * would be a shape neither the database nor the predicates accept.
 */
export function makeTemplate(overrides: Partial<EntryTemplate> = {}): EntryTemplate {
  return {
    id: 1,
    name: '家賃',
    recurrence: monthlyOn(1),
    type: 'expense',
    enabled: true,
    sortOrder: 0,
    categoryId: null,
    defaultAmount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}
