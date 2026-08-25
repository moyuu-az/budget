import type { AssetFieldDef } from './asset-fields';

// ---------------------------------------------------------------------------
// Starting points for asset tracking, and the shape of the one category that is
// not optional.
//
// WHY TEMPLATES AND NOT SEEDED ROWS
//   Everything except cash is optional. Seeding NISA into every ledger at
//   creation would put an empty category in front of every household that never
//   wanted the feature, and deleting it would be the first thing they did. A
//   template is inert until someone applies it, which keeps "optional" true
//   while still sparing the user from inventing 「銘柄」 from scratch.
//
//   It also keeps the server out of it: applying a template is an ordinary
//   addAssetCategory call with these fields, so there is no seeding path to keep
//   idempotent and no migration that writes user-visible data.
//
// The keys below are stable identifiers for the template itself, NOT stored on
// the created category -- once applied, a category is an ordinary category the
// user may rename, re-shape or delete.
//
// 現金 IS NOT IN THE LIST. It is not a starting point a household may or may not
// take: its holdings ARE the account balance, so every ledger has exactly one
// and the server provisions it. Offering it here would let someone create a
// SECOND 現金 category, which is precisely the double count this design removes.
// Its defaults are CASH_CATEGORY_DEFAULTS below.
// ---------------------------------------------------------------------------

export interface AssetCategoryTemplate {
  key: string;
  name: string;
  /** One line explaining what belongs in this category, shown in the picker. */
  description: string;
  color: string;
  fields: AssetFieldDef[];
}

export const ASSET_CATEGORY_TEMPLATES: readonly AssetCategoryTemplate[] = [
  {
    key: 'nisa',
    name: 'NISA',
    description: '銘柄ごとに保有数量と取得単価を記録します。',
    color: '#22c55e',
    fields: [
      // 銘柄 is required: a NISA row without it cannot be told apart from the
      // next one, and the whole category becomes a single unlabelled number.
      { key: 'f1', label: '銘柄', type: 'text', required: true, unit: null },
      { key: 'f2', label: '証券会社', type: 'text', required: false, unit: null },
      { key: 'f3', label: '保有数量', type: 'number', required: false, unit: '口' },
      { key: 'f4', label: '取得単価', type: 'number', required: false, unit: '円' },
    ],
  },
] as const;

/**
 * The cash category every ledger gets.
 *
 * Cash needs no parameters beyond where it is kept: the amount IS the value, so
 * 保管場所 is the only field, and it is optional -- a household with one bank
 * account should not have to name it.
 *
 * KEEP IN STEP WITH migration 004, which writes the same three values when it
 * back-fills existing ledgers. The duplication is unavoidable (a .sql file
 * cannot import this one) and harmless: the migration runs once, and this
 * constant is what every ledger created afterwards uses. If they disagree, the
 * only symptom is an older ledger whose cash category has a different colour.
 */
export const CASH_CATEGORY_DEFAULTS: {
  name: string;
  color: string;
  sortOrder: number;
  fields: AssetFieldDef[];
} = {
  name: '現金',
  color: '#38bdf8',
  // Ahead of anything the user creates: cash is the figure the forecast runs on,
  // so it belongs at the top of the 資産 screen.
  sortOrder: -1,
  fields: [{ key: 'f1', label: '保管場所', type: 'text', required: false, unit: null }],
};

export function findAssetTemplate(key: string): AssetCategoryTemplate | undefined {
  return ASSET_CATEGORY_TEMPLATES.find((template) => template.key === key);
}
