import type { Asset, AssetCategory } from '../types';

// ---------------------------------------------------------------------------
// What the household holds right now.
//
// WHY THE PARTS ARE ALWAYS CARRIED ALONGSIDE THE TOTAL
//   `cash` is the account balance the forecast starts from. `assets` is the 資産
//   list. Whether those overlap depends entirely on how a household uses the
//   app: someone who records their bank account as a 現金 asset has it in both,
//   and a total that simply adds them counts that money twice.
//
//   The app cannot know which it is, and guessing would produce a figure that is
//   silently wrong for half its users. So the total is never shown alone -- the
//   card renders `残高 ＋ 資産 ＝ 純資産`, and a double entry becomes visible the
//   moment it happens instead of hiding inside one number.
//
//   That is also why there is no "this category is already in the balance" flag:
//   a flag would move the same judgement into a setting the user has to keep
//   correct, and would hide the mistake again when they got it wrong.
// ---------------------------------------------------------------------------

/**
 * Sum of every holding.
 *
 * Lives here rather than in the asset store so that `src/utils/` depends on
 * nothing: importing it from the store pulled zustand, the API client and the
 * toast store in behind it, and would have become a cycle the moment the store
 * wanted anything from this module.
 *
 * Takes anything with a `value` so a projection can be summed through the same
 * function -- two reduces over the same field is how two screens end up
 * disagreeing after only one of them is fixed.
 */
export function totalAssetValue(assets: readonly { value: number }[]): number {
  return assets.reduce((sum, asset) => sum + asset.value, 0);
}

export interface HoldingsCategoryLine {
  id: number;
  name: string;
  color: string | null;
  value: number;
}

export interface Holdings {
  /** The account balance -- the figure the forecast projects forward. */
  cash: number;
  /**
   * Everything in 資産, summed.
   *
   * Can be negative: a household that tracks a loan balance as an asset
   * category enters it negative, which is the only way the total means anything.
   */
  assets: number;
  /** cash + assets. Only meaningful shown beside its parts; see the note above. */
  total: number;
  /** One line per category that actually holds something, in display order. */
  byCategory: HoldingsCategoryLine[];
  /**
   * Holdings whose category is not in `byCategory`, summed.
   *
   * Normally zero. It is non-zero while the client holds a holding whose
   * category it has not fetched -- which happens, because updating one holding
   * refetches the holdings. Without this line the chips would quietly fail to
   * add up to `assets`, which is the very failure this card exists to prevent
   * one level up.
   */
  other: number;
}

export function summarizeHoldings(
  cash: number,
  categories: readonly AssetCategory[],
  assets: readonly Asset[],
): Holdings {
  // NOTHING IS ROUNDED HERE.
  //
  // An earlier version rounded each holding so the chips would sum exactly to
  // the asset total. It worked on this card and broke the 資産 screen, which
  // rounds only for display: the same two holdings of 100.5 read ¥202 here and
  // ¥201 there. Rounding in two places is the problem, not the cure.
  //
  // So rounding happens once, at the very edge, in utils/currency.ts -- and the
  // reason it can be left that late is that a holding's value is now required to
  // be a whole number of yen (server/http/input-schemas.ts). With integers in,
  // every sum on every screen is exact and identical.
  const totals = new Map<number, number>();
  for (const asset of assets) {
    totals.set(asset.categoryId, (totals.get(asset.categoryId) ?? 0) + asset.value);
  }

  const byCategory = [...categories]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
    // A category with no holdings would render as ¥0, which reads as a figure
    // rather than as "nothing recorded here yet".
    .filter((category) => totals.has(category.id))
    .map((category) => ({
      id: category.id,
      name: category.name,
      color: category.color,
      value: totals.get(category.id) as number,
    }));

  // Summed from the holdings themselves, not from byCategory: one whose category
  // has vanished from the list still belongs in the total. `other` below is what
  // keeps that difference visible instead of silent.
  const assetTotal = totalAssetValue(assets);
  const shown = byCategory.reduce((sum, line) => sum + line.value, 0);

  return {
    cash,
    assets: assetTotal,
    total: cash + assetTotal,
    byCategory,
    other: assetTotal - shown,
  };
}
