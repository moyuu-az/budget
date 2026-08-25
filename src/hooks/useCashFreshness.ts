import { useMemo } from 'react';
import { useAssetStore } from '../stores/useAssetStore';
import { findCashCategory } from '../utils/net-worth';

// ---------------------------------------------------------------------------
// HOW OLD IS THE NUMBER THE FORECAST STARTS FROM?
//
// 現在の残高 is typed in by hand. Every projection on the dashboard, every
// warning, every 使っていい額 is computed from it -- and the moment somebody
// forgets to update it, all of them are confidently wrong, with nothing on
// screen saying so.
//
// That is the weakest point in this application, and until now it was also the
// most hidden one. A stale balance and a current balance render identically.
//
// This does not fix the staleness -- nothing can, short of a bank connection --
// but it makes it VISIBLE, which turns a silent error into a prompt. The whole
// value is in the second sentence of the caption: not 「¥1,721,724」 but
// 「¥1,721,724 · 18日前に更新」.
//
// WHY THE NEWEST HOLDING, NOT THE OLDEST
//   The question is "when did somebody last tell us about this money", and a
//   household with a 財布 they update weekly and a 定期 they touch once a year
//   is not stale. Reading the oldest would flag every such household forever,
//   and a warning that is always on is a warning nobody reads.
// ---------------------------------------------------------------------------

/**
 * How long a balance may go unedited before it is worth mentioning.
 *
 * 14 days: long enough that a household updating after each payday (monthly, or
 * twice monthly) is never nagged, short enough that a figure carried through two
 * pay cycles gets questioned. It is a prompt, not an error -- nothing is blocked
 * and nothing is hidden.
 */
export const STALE_AFTER_DAYS = 14;

export interface CashFreshness {
  /**
   * ISO timestamp of the most recently edited cash holding, or null.
   *
   * Null means the ledger records no cash at all -- a different situation from
   * "recorded long ago", and one the caption already covers by saying the
   * balance comes from no holdings.
   */
  updatedAt: string | null;
  /** Whole days since that edit, or null when there is nothing to measure. */
  daysSince: number | null;
  /** True once `daysSince` passes STALE_AFTER_DAYS. False when unknown. */
  isStale: boolean;
}

/** Whole days between two instants, floored. Negative clamps to 0. */
function daysBetween(from: Date, to: Date): number {
  const startOfFrom = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const startOfTo = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  const diff = Math.round((startOfTo.getTime() - startOfFrom.getTime()) / 86_400_000);
  // A clock skewed forward on the server would otherwise produce 「-1日前に更新」,
  // which reads as a bug rather than as the rounding artefact it is.
  return Math.max(diff, 0);
}

export function useCashFreshness(): CashFreshness {
  const categories = useAssetStore((s) => s.categories);
  const assets = useAssetStore((s) => s.assets);

  return useMemo(() => {
    const cash = findCashCategory(categories);
    if (!cash) return { updatedAt: null, daysSince: null, isStale: false };

    let newest: string | null = null;
    for (const asset of assets) {
      if (asset.categoryId !== cash.id) continue;
      // String comparison, which is valid for ISO 8601 in a single timezone
      // offset and is what the column produces. Parsing each one to a Date to
      // compare would be the same answer at more cost.
      if (newest === null || asset.updatedAt > newest) newest = asset.updatedAt;
    }

    if (newest === null) return { updatedAt: null, daysSince: null, isStale: false };

    const daysSince = daysBetween(new Date(newest), new Date());
    return { updatedAt: newest, daysSince, isStale: daysSince >= STALE_AFTER_DAYS };
  }, [categories, assets]);
}
