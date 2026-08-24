import type { Asset, AssetCategory } from '../types';
import { totalAssetValue } from '../stores/useAssetStore';

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
  // ROUNDED ONCE, HERE, AND NEVER AGAIN.
  //
  // Asset values are NUMERIC(14,2), so two holdings of 100.5 sum to 201. Round
  // for display at each figure independently and the card shows ¥101 + ¥101
  // against a total of ¥201 -- a one-yen contradiction on the very line whose
  // job is to prove the parts add up. Rounding the parts first and deriving
  // every total from the rounded parts makes the arithmetic on screen true by
  // construction.
  const rounded = assets.map((asset) => ({
    categoryId: asset.categoryId,
    value: Math.round(asset.value),
  }));

  const totals = new Map<number, number>();
  for (const asset of rounded) {
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
  const assetTotal = totalAssetValue(rounded);
  const shown = byCategory.reduce((sum, line) => sum + line.value, 0);

  return {
    cash: Math.round(cash),
    assets: assetTotal,
    total: Math.round(cash) + assetTotal,
    byCategory,
    other: assetTotal - shown,
  };
}
