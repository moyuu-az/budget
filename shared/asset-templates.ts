import type { AssetFieldDef } from './asset-fields';

// ---------------------------------------------------------------------------
// Starting points for asset tracking.
//
// WHY TEMPLATES AND NOT SEEDED ROWS
//   Asset tracking is optional. Seeding NISA and 現金 into every ledger at
//   creation would put two empty categories in front of every household that
//   never wanted the feature, and deleting them would be the first thing they
//   did. A template is inert until someone applies it, which keeps "optional"
//   true while still sparing the user from inventing 「銘柄」 from scratch.
//
//   It also keeps the server out of it: applying a template is an ordinary
//   addAssetCategory call with these fields, so there is no seeding path to keep
//   idempotent and no migration that writes user-visible data.
//
// The keys below are stable identifiers for the template itself, NOT stored on
// the created category -- once applied, a category is an ordinary category the
// user may rename, re-shape or delete.
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
  {
    key: 'cash',
    name: '現金',
    // Cash needs no parameters beyond where it is: the amount IS the value, and
    // an empty `fields` list is a first-class case rather than an oversight.
    description: '財布や銀行口座などの残高をそのまま記録します。',
    color: '#38bdf8',
    fields: [{ key: 'f1', label: '保管場所', type: 'text', required: false, unit: null }],
  },
] as const;

export function findAssetTemplate(key: string): AssetCategoryTemplate | undefined {
  return ASSET_CATEGORY_TEMPLATES.find((template) => template.key === key);
}
