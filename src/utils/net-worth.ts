import type { Asset, AssetCategory } from '../types';

// ---------------------------------------------------------------------------
// What the household holds right now.
//
// CASH IS AN ASSET, AND THE BALANCE IS THE SUM OF IT.
//
//   Every ledger has exactly one asset category with `kind: 'cash'`, and its
//   holdings are 「現在の残高」 -- the money at hand, and the figure the forecast
//   starts from. There is no separate balance stored anywhere.
//
//   That is a deliberate correction. Cash used to live in TWO places: a
//   `current_balance` setting AND, for anyone who used 資産, a 現金 category
//   holding the same money. Nothing in the data could tell whether they
//   overlapped, so the dashboard added them and called the result 純資産 --
//   silently wrong for exactly the households that used the feature most.
//
//   The cure was not a 「この分類は残高に含む」 flag. A flag moves the judgement
//   into a setting the user has to keep correct, and hides the mistake again
//   when they get it wrong. Removing the second place removes the question.
//
// SO: 現金 IS A SUBSET OF 資産, NEVER A SIBLING OF IT.
//   `total` here is net worth and ALREADY INCLUDES `cash`. Anything that adds
//   the two together is double counting -- the very bug this shape exists to
//   make unrepresentable.
// ---------------------------------------------------------------------------

/**
 * Sum of every holding passed in.
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

/**
 * The one category whose holdings are the balance.
 *
 * Matched on `kind`, never on the name: the user is free to rename 現金 to their
 * bank's name, and the forecast must not start reading zero because of it.
 *
 * `undefined` only while the category list has not loaded yet (the server
 * provisions the row on read, so a loaded list always has one). Callers treat
 * that as ¥0 rather than as an error -- the same thing every store shows before
 * its first fetch lands.
 */
export function findCashCategory(
  categories: readonly AssetCategory[],
): AssetCategory | undefined {
  return categories.find((category) => category.kind === 'cash');
}

/**
 * 現在の残高: how much money the household has at hand.
 *
 * THE SINGLE DEFINITION. Everything that needs the balance -- the forecast, the
 * sidebar, the dashboard -- comes through here or through the hook that wraps
 * it (src/hooks/useCashBalance.ts). A second reduce over the cash category
 * somewhere else is how two screens start disagreeing.
 */
export function cashTotal(
  categories: readonly AssetCategory[],
  assets: readonly Asset[],
): number {
  const cash = findCashCategory(categories);
  if (!cash) return 0;
  return totalAssetValue(assets.filter((asset) => asset.categoryId === cash.id));
}

export interface HoldingsCategoryLine {
  id: number;
  name: string;
  color: string | null;
  value: number;
  /** True for the cash category, so a view can label or order it differently. */
  isCash: boolean;
}

export interface Holdings {
  /** 現在の残高 -- the cash category's holdings, and the forecast's starting point. */
  cash: number;
  /**
   * Everything that is NOT cash: investments, and anything else being tracked.
   *
   * Can be negative: a household that tracks a loan balance as an asset category
   * enters it negative, which is the only way the total means anything.
   */
  nonCash: number;
  /** 純資産 -- every holding, cash INCLUDED. Never add `cash` to this. */
  total: number;
  /** One line per category that actually holds something, in display order. */
  byCategory: HoldingsCategoryLine[];
  /**
   * Holdings whose category is not in `byCategory`, summed.
   *
   * Normally zero. It is non-zero while the client holds a holding whose
   * category it has not fetched -- which happens on a shared ledger, because
   * updating one holding refetches the holdings but deliberately not the
   * categories (see useAssetStore.updateAsset). Without this line the chips
   * would quietly fail to add up to the total, which is the very failure this
   * card exists to prevent one level up.
   */
  unlisted: number;
}

export function summarizeHoldings(
  categories: readonly AssetCategory[],
  assets: readonly Asset[],
): Holdings {
  // NOTHING IS ROUNDED HERE.
  //
  // An earlier version rounded each holding so the chips would sum exactly to
  // the total. It worked on this card and broke the 資産 screen, which rounds
  // only for display: the same two holdings of 100.5 read ¥202 here and ¥201
  // there. Rounding in two places is the problem, not the cure.
  //
  // So rounding happens once, at the very edge, in utils/currency.ts -- and the
  // reason it can be left that late is that a holding's value is now required to
  // be a whole number of yen (server/http/input-schemas.ts). With integers in,
  // every sum on every screen is exact and identical.
  const totals = new Map<number, number>();
  for (const asset of assets) {
    totals.set(asset.categoryId, (totals.get(asset.categoryId) ?? 0) + asset.value);
  }

  const cashCategory = findCashCategory(categories);

  const byCategory = [...categories]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
    // A category with no holdings would render as ¥0, which reads as a figure
    // rather than as "nothing recorded here yet". Cash is the exception: it is
    // always meaningful, and an empty cash category genuinely means ¥0 at hand.
    .filter((category) => totals.has(category.id) || category.kind === 'cash')
    .map((category) => ({
      id: category.id,
      name: category.name,
      color: category.color,
      value: totals.get(category.id) ?? 0,
      isCash: category.kind === 'cash',
    }));

  // Summed from the holdings themselves, not from byCategory: one whose category
  // has vanished from the list still belongs in the total. `unlisted` below is
  // what keeps that difference visible instead of silent.
  const total = totalAssetValue(assets);
  const shown = byCategory.reduce((sum, line) => sum + line.value, 0);
  const cash = cashCategory ? (totals.get(cashCategory.id) ?? 0) : 0;

  return {
    cash,
    nonCash: total - cash,
    total,
    byCategory,
    unlisted: total - shown,
  };
}
