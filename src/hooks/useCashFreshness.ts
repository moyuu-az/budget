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
// WHY IT REPORTS BOTH ENDS
//   The first version read only the NEWEST holding, reasoning that a household
//   updating its 財布 weekly is not stale. That reasoning answered the wrong
//   question. What is displayed -- and what the forecast starts from -- is the
//   SUM, and a sum is only as current as its stalest part.
//
//   Concretely: a 銀行口座 of ¥1,000,000 last touched 300 days ago beside a
//   財布 of ¥10,000 updated today. Reading the newest reports 「今日更新」 for
//   ¥1,010,000, of which 99% is a year out of date -- and the reassurance is
//   strongest exactly where the error is largest.
//
//   So the caption still names the LATEST edit (that is the honest answer to
//   "when did anything last change") and staleness is judged on the OLDEST,
//   with a count so the household knows how much of the total is in question.
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
  /** Whole days since that most recent edit, or null when there is nothing to measure. */
  daysSince: number | null;
  /**
   * True when ANY cash holding is older than STALE_AFTER_DAYS.
   *
   * Judged on the oldest, not the newest, because the figure on screen is the
   * SUM: one component left untouched for a year makes the total that stale,
   * however recently the others were edited.
   */
  isStale: boolean;
  /** How many holdings are older than STALE_AFTER_DAYS, so the caption can say. */
  staleCount: number;
  /** Whole days since the OLDEST edit, or null when there is nothing to measure. */
  oldestDaysSince: number | null;
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
    const nothing: CashFreshness = {
      updatedAt: null,
      daysSince: null,
      isStale: false,
      staleCount: 0,
      oldestDaysSince: null,
    };

    const cash = findCashCategory(categories);
    if (!cash) return nothing;

    const now = new Date();
    let newest: string | null = null;
    let oldest: string | null = null;
    let staleCount = 0;

    for (const asset of assets) {
      if (asset.categoryId !== cash.id) continue;
      // String comparison, which is valid for ISO 8601 in a single timezone
      // offset and is what the column produces. Parsing each one to a Date to
      // compare would be the same answer at more cost.
      if (newest === null || asset.updatedAt > newest) newest = asset.updatedAt;
      if (oldest === null || asset.updatedAt < oldest) oldest = asset.updatedAt;
      if (daysBetween(new Date(asset.updatedAt), now) >= STALE_AFTER_DAYS) staleCount += 1;
    }

    if (newest === null || oldest === null) return nothing;

    return {
      updatedAt: newest,
      daysSince: daysBetween(new Date(newest), now),
      // The OLDEST decides, because the balance is the sum -- see the note above.
      isStale: staleCount > 0,
      staleCount,
      oldestDaysSince: daysBetween(new Date(oldest), now),
    };
  }, [categories, assets]);
}
