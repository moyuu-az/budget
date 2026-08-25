import type { Category, EntryTemplate, MonthlyActualsMap, MonthlyAmountsMap } from '../types';
import { occursInMonth } from '../../shared/recurrence';
import { resolveAmount } from '../stores/useMonthlyStore';

// ---------------------------------------------------------------------------
// DID THE MONTH GO THE WAY IT WAS PLANNED?
//
// The application has recorded actuals since before this change, and until now
// the only place they appeared was the 分析 screen. Anyone who reaches 分析 is
// already thinking about their spending; the household that needs to hear
// 「先月は予算より ¥32,000 多く使いました」 is the one that opens the dashboard
// and leaves.
//
// WHY THE LAST *COMPLETE* MONTH
//   A month in progress is always under budget -- half its expenses have not
//   happened yet. Comparing one would show a comfortable surplus on the 5th and
//   a deficit on the 28th, every month, which teaches the reader to ignore it.
//
// WHY ENTRIES WITH NO RECORDED ACTUAL ARE EXCLUDED FROM *BOTH* SIDES
//   This is the load-bearing decision in the file. An entry the household has
//   not got round to entering is not an entry they spent ¥0 on. Counting its
//   plan without its actual manufactures a surplus that grows with how far
//   behind the household is on data entry -- the app would congratulate them
//   most loudly exactly when it knows least.
//
//   So the comparison covers only what has been recorded, and how much has NOT
//   been recorded is reported alongside it (`missingCount`) rather than folded
//   in. A reader can then tell 「予算どおり」 from 「まだ入力していない」, which
//   are the same number and opposite meanings.
// ---------------------------------------------------------------------------

export interface VarianceLine {
  templateId: number;
  name: string;
  /** Category colour, for the dot beside the name. Null when uncategorised. */
  color: string | null;
  planned: number;
  actual: number;
  /** actual - planned. Positive means more was spent than planned. */
  diff: number;
}

export interface MonthlyVariance {
  /** The month compared, 'YYYY-MM'. */
  yearMonth: string;
  /** How many of the month's entries have a recorded actual. */
  recordedCount: number;
  /**
   * How many occur in the month but have no actual recorded.
   *
   * Reported, never folded into the totals -- see the note above. A card showing
   * a surplus with `missingCount: 12` is telling a very different story from the
   * same surplus with `missingCount: 0`, and only one of them is good news.
   */
  missingCount: number;
  /** Planned total across the RECORDED entries only. */
  plannedTotal: number;
  /** Actual total across the same entries. */
  actualTotal: number;
  /** actualTotal - plannedTotal. Positive means overspent. */
  variance: number;
  /** The recorded entries, largest overspend first. */
  lines: VarianceLine[];
}

/**
 * The month before the one containing `today`, as 'YYYY-MM'.
 *
 * Local time and month arithmetic, matching shared/recurrence.ts: a UTC-based
 * answer is the previous month for the first hours of every month anywhere east
 * of Greenwich.
 */
export function previousMonth(today: Date): string {
  const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  return `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Compares plan against reality for one month.
 *
 * `type` is a parameter rather than fixed to 'expense' because income misses its
 * plan too -- a month where the salary arrived short is exactly as worth knowing
 * -- and a second copy of this function for the other direction is how the two
 * would drift over what counts as "recorded".
 */
export function summarizeVariance(
  templates: readonly EntryTemplate[],
  categories: readonly Category[],
  amountsMap: MonthlyAmountsMap,
  actualsMap: MonthlyActualsMap,
  yearMonth: string,
  type: 'income' | 'expense',
): MonthlyVariance {
  const colorById = new Map(categories.map((category) => [category.id, category.color]));
  const monthActuals = actualsMap.get(yearMonth);

  const lines: VarianceLine[] = [];
  let missingCount = 0;

  for (const template of templates) {
    if (template.type !== type) continue;
    // Occurrence, not `enabled`: an annual premium is enabled every month and
    // belongs to one of them. Counting it in the other eleven would report a
    // shortfall the household never had.
    if (!occursInMonth(template.recurrence, yearMonth)) continue;

    const actual = monthActuals?.get(template.id);
    if (actual === undefined) {
      // Disabled entries are not counted as missing: the household paused them
      // on purpose, so there is nothing they forgot to enter.
      if (template.enabled) missingCount += 1;
      continue;
    }

    const planned = resolveAmount(template.id, yearMonth, amountsMap, templates);
    lines.push({
      templateId: template.id,
      name: template.name,
      color: template.categoryId === null ? null : colorById.get(template.categoryId) ?? null,
      planned,
      actual,
      diff: actual - planned,
    });
  }

  // Largest overspend first: the reader is looking for what went wrong, and a
  // list sorted by amount buries a ¥30,000 overrun under a ¥120,000 rent that
  // landed exactly as planned.
  lines.sort((a, b) => b.diff - a.diff);

  const plannedTotal = lines.reduce((sum, line) => sum + line.planned, 0);
  const actualTotal = lines.reduce((sum, line) => sum + line.actual, 0);

  return {
    yearMonth,
    recordedCount: lines.length,
    missingCount,
    plannedTotal,
    actualTotal,
    variance: actualTotal - plannedTotal,
    lines,
  };
}
