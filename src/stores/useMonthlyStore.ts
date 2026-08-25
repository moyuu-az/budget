import { create } from 'zustand';
import type {
  EntryTemplate,
  MonthlyAmountsMap,
  MonthlyActualsMap,
} from '../types';
import { getApi } from '../lib/api';
import { reportError } from '../app/reportError';
import { applyIfCurrent, currentGeneration, isCurrent } from '../app/ledger-generation';
import { occursInMonth } from '../../shared/recurrence';
import type { LoadStatus } from './load-status';
import type { Recurrence } from '../types';

interface MonthlyState {
  monthlyAmountsMap: MonthlyAmountsMap;
  monthlyActualsMap: MonthlyActualsMap;
  /**
   * Where the fetch for each 'YYYY-MM' has got to.
   *
   * WHY PER-MONTH AND NOT ONE FLAG
   *   Both maps are empty for THREE different reasons -- never asked for, asked
   *   for and still in flight, asked for and failed -- and for a fourth that is
   *   not a problem at all: a month the household genuinely recorded nothing in.
   *   With no status the four are indistinguishable, and a reader has to guess.
   *
   *   先月の予実 is where that guess is expensive. It renders 「実績が記録されて
   *   いません」 from an empty map, which is a positive claim: during the initial
   *   load it is briefly false, and after a failed request it is false forever,
   *   for a household whose actuals exist and simply could not be fetched.
   *
   *   Keyed by month because months are fetched independently -- the dashboard
   *   asks for a forward range, the variance card asks for last month, and
   *   EntriesView asks for whichever month is on screen.
   */
  monthStatus: ReadonlyMap<string, MonthFetchStatus>;
  loading: boolean;
  reset: () => void;
  /**
   * Drops cached per-month amounts that `recurrence` no longer covers.
   *
   * Called after a recurrence change succeeds, because the SERVER deletes those
   * rows in the same transaction (see occurrence-guard.ts). Without this the
   * cache keeps them: change an entry to yearly and back without leaving the
   * screen, and the totals go on using a figure the database no longer holds --
   * a reload would change the numbers, which is the definition of the screen
   * lying.
   *
   * Mirrors the server's rule rather than clearing everything for that entry:
   * blunt clearing would blank the CURRENT month's override until the next
   * fetch, showing a wrong number on the way to the right one.
   */
  forgetAmountsOutside: (templateId: number, recurrence: Recurrence) => void;
  fetchActualsRange: (startMonth: string, endMonth: string) => Promise<void>;
  /**
   * Loads one month's planned overrides.
   *
   * Skips a month already loaded or in flight unless `force`, for the same
   * reason the range version does: 今月のサマリー is mounted TWICE (one shell
   * per breakpoint) and 収支管理 may be asking for the same month beside it, so
   * an un-deduplicated fetch here sends the identical request three times.
   *
   * 'error' is NOT skipped. Two callers use one callback for both the first
   * load and their retry button (SankeyChart, useMonthlyVariance); skipping a
   * failed month would make that button a no-op that looks like it worked.
   *
   * `force` is for a caller that knows the cached month is stale -- after a
   * write that partially failed, where 'ready' is true and wrong.
   */
  fetchMonthlyAmounts: (yearMonth: string, force?: boolean) => Promise<void>;
  /**
   * Loads planned amounts for a whole range.
   *
   * Skips months already loaded or in flight unless `force` is set. Two panels
   * on the dashboard ask for overlapping ranges (the chart for its selected
   * period, the KPI row for a fixed 90 days) and both must be satisfied without
   * sending the same request twice -- the browser caps concurrent connections,
   * and a duplicate here delays whatever is behind it.
   *
   * `force` is what the retry button needs: after a failure the months are
   * marked 'error', and a caller asking again means "try anyway".
   */
  fetchMonthlyAmountsRange: (startMonth: string, endMonth: string, force?: boolean) => Promise<void>;
  /** Returns whether the write was stored; see useAssetStore for why boolean. */
  setMonthlyAmount: (templateId: number, yearMonth: string, amount: number) => Promise<boolean>;
  deleteMonthlyAmount: (templateId: number, yearMonth: string) => Promise<boolean>;
  /**
   * Returns whether the copy actually happened.
   *
   * `void` would be a lie the caller cannot detect: reportError has already
   * raised the toast, so a try/catch at the call site never runs and
   * 「先月の金額をコピーしました」 fires beside the error message -- telling a
   * household its month is budgeted when nothing was written. Same reasoning as
   * useAssetStore and useTemplateStore.
   */
  copyMonthlyAmounts: (fromMonth: string, toMonth: string) => Promise<boolean>;
  /** See fetchMonthlyAmounts for the deduplication rule; identical. */
  fetchMonthlyActuals: (yearMonth: string, force?: boolean) => Promise<void>;
  setMonthlyActual: (templateId: number, yearMonth: string, amount: number) => Promise<boolean>;
  deleteMonthlyActual: (templateId: number, yearMonth: string) => Promise<boolean>;
}

/**
 * A month's two halves, tracked separately because they are two requests.
 *
 * A card comparing plan against reality with one half missing reports a variance
 * equal to whichever side arrived -- so 'ready' has to mean BOTH, and that can
 * only be decided if both are recorded.
 */
export interface MonthFetchStatus {
  amounts: LoadStatus;
  actuals: LoadStatus;
}

const IDLE_MONTH: MonthFetchStatus = { amounts: 'idle', actuals: 'idle' };

/**
 * Whether one half of one month has been dealt with -- loaded, or on its way.
 *
 * The deduplication predicate, defined once so the single-month fetchers and
 * the range fetcher cannot drift into disagreeing about what "already asked
 * for" means. 'error' is deliberately NOT settled: a failed month is one a
 * retry must be able to ask for again.
 */
function isSettled(
  monthStatus: ReadonlyMap<string, MonthFetchStatus>,
  yearMonth: string,
  half: keyof MonthFetchStatus,
): boolean {
  const status = (monthStatus.get(yearMonth) ?? IDLE_MONTH)[half];
  return status === 'ready' || status === 'loading';
}

/** Records one half's status for one or more months, leaving the rest alone. */
function setHalf(
  current: ReadonlyMap<string, MonthFetchStatus>,
  months: string | readonly string[],
  half: keyof MonthFetchStatus,
  status: LoadStatus,
): ReadonlyMap<string, MonthFetchStatus> {
  const next = new Map(current);
  for (const yearMonth of typeof months === 'string' ? [months] : months) {
    next.set(yearMonth, { ...(current.get(yearMonth) ?? IDLE_MONTH), [half]: status });
  }
  return next;
}

/**
 * Every 'YYYY-MM' from `start` to `end` inclusive.
 *
 * Needed because a RANGE fetch has to mark each month it covers: a status kept
 * only for the range as a whole could not answer "is THIS month loaded", which
 * is the question every reader actually has.
 *
 * Bounded at 240 (twenty years) so a malformed pair cannot spin: the callers
 * derive both ends from the forecast horizon, but a loop with no ceiling is a
 * hang waiting for the first bad input.
 */
function monthsInRange(start: string, end: string): string[] {
  const months: string[] = [];
  let year = Number(start.slice(0, 4));
  let month = Number(start.slice(5, 7));
  for (let i = 0; i < 240; i++) {
    const key = `${year}-${String(month).padStart(2, '0')}`;
    if (key > end) break;
    months.push(key);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return months;
}

/**
 * How far BOTH halves of `yearMonth` have got, as one status.
 *
 * For a reader that needs plan AND reality -- the variance card. Nothing outside
 * this module should have to know the fetch comes in two pieces.
 */
export function monthStatusOf(
  monthStatus: ReadonlyMap<string, MonthFetchStatus>,
  yearMonth: string,
): LoadStatus {
  const half = monthStatus.get(yearMonth) ?? IDLE_MONTH;
  if (half.amounts === 'error' || half.actuals === 'error') return 'error';
  return half.amounts === 'ready' && half.actuals === 'ready' ? 'ready' : 'loading';
}

/**
 * How far ONE half has got across every month in a range.
 *
 * For the forecast, which needs the planned overrides and has no use for the
 * actuals. Asking for both would leave it permanently 'loading', because nothing
 * fetches actuals for the months ahead.
 *
 * 'error' wins over 'loading' wins over 'ready': a projection built from a range
 * where one month failed is not a cautious projection, it is one silently
 * missing that month's override -- a ¥500,000 rent read as its ¥100,000 default.
 */
export function rangeStatusOf(
  monthStatus: ReadonlyMap<string, MonthFetchStatus>,
  months: readonly string[],
  half: keyof MonthFetchStatus,
): LoadStatus {
  let sawPending = false;
  for (const yearMonth of months) {
    const status = (monthStatus.get(yearMonth) ?? IDLE_MONTH)[half];
    if (status === 'error') return 'error';
    if (status !== 'ready') sawPending = true;
  }
  return sawPending ? 'loading' : 'ready';
}

export { monthsInRange };

/**
 * Undoes ONE optimistic write, and only if nothing has changed it since.
 *
 * WHY NOT RESTORE THE WHOLE MAP
 *   Every mutation used to snapshot the entire month map and restore it on
 *   failure. That is correct in isolation and wrong the moment two run at once
 *   -- and they do: 「デフォルトにリセット」 fires one delete per entry through
 *   Promise.all. If B's delete succeeds and A's then fails, A's rollback
 *   restores a snapshot taken before either ran, and B reappears on screen
 *   having been deleted in the database. The screen then disagrees with storage
 *   until the next fetch, and the caller still says 「リセットしました」.
 *
 *   Scoping the undo to the one key it wrote makes concurrent mutations
 *   independent, which is what they already are everywhere else.
 *
 * WHY IT CHECKS `optimistic` FIRST
 *   Between the write and the failure, a newer edit may have set the same key to
 *   something else -- the user retyping, or the other member of a shared ledger.
 *   Overwriting that with an older value would undo an edit nobody asked to
 *   undo. If the current value is not what this mutation put there, this
 *   mutation is no longer the last word and says nothing.
 */
function revertEntry(
  current: MonthlyAmountsMap,
  yearMonth: string,
  templateId: number,
  optimistic: number | undefined,
  previous: number | undefined,
): MonthlyAmountsMap {
  const monthMap = current.get(yearMonth);
  const now = monthMap?.get(templateId);
  if (now !== optimistic) return current;

  const next = new Map(current);
  const nextMonth = new Map(monthMap ?? []);
  if (previous === undefined) nextMonth.delete(templateId);
  else nextMonth.set(templateId, previous);
  next.set(yearMonth, nextMonth);
  return next;
}

export const useMonthlyStore = create<MonthlyState>((set, get) => ({
  monthlyAmountsMap: new Map(),
  monthlyActualsMap: new Map(),
  monthStatus: new Map(),
  loading: false,

  /**
   * Clears everything this store holds.
   *
   * Called when the active ledger changes. Without it the previous ledger's
   * numbers would stay on screen under the new ledger's name until each fetch
   * came back -- brief, but a household budget showing someone else's figures
   * even for a moment is not acceptable.
   */
  // Fresh Maps, not a shared instance: the same object handed back on every
  // reset would let a stale reference keep mutating live state.
  reset: () =>
    set({
      monthlyAmountsMap: new Map(),
      monthlyActualsMap: new Map(),
      monthStatus: new Map(),
      loading: false,
    }),

  forgetAmountsOutside: (templateId, recurrence) =>
    set((state) => {
      const next = new Map(state.monthlyAmountsMap);
      let changed = false;
      for (const [yearMonth, monthMap] of next) {
        if (!monthMap.has(templateId) || occursInMonth(recurrence, yearMonth)) continue;
        const copy = new Map(monthMap);
        copy.delete(templateId);
        next.set(yearMonth, copy);
        changed = true;
      }
      // A new Map only when something actually moved: an unconditional one would
      // re-render every subscriber on every template edit.
      return changed ? { monthlyAmountsMap: next } : state;
    }),

  fetchActualsRange: async (startMonth: string, endMonth: string) => {
    const tag = currentGeneration();
    const months = monthsInRange(startMonth, endMonth);
    set({ loading: true, monthStatus: setHalf(get().monthStatus, months, 'actuals', 'loading') });
    try {
      const actuals = await getApi().getMonthlyActualsRange(startMonth, endMonth);
      const newMap = new Map(get().monthlyActualsMap);
      for (const [key] of newMap) {
        if (key >= startMonth && key <= endMonth) {
          newMap.delete(key);
        }
      }
      for (const a of actuals) {
        if (!newMap.has(a.yearMonth)) {
          newMap.set(a.yearMonth, new Map<number, number>());
        }
        newMap.get(a.yearMonth)!.set(a.templateId, a.actualAmount);
      }
      applyIfCurrent(tag, () =>
        set({
          monthlyActualsMap: newMap,
          loading: false,
          monthStatus: setHalf(get().monthStatus, months, 'actuals', 'ready'),
        }),
      );
    } catch (e) {
      applyIfCurrent(tag, () => {
        set({
          loading: false,
          monthStatus: setHalf(get().monthStatus, months, 'actuals', 'error'),
        });
        reportError(e);
      });
    }
  },

  fetchMonthlyAmounts: async (yearMonth: string, force = false) => {
    if (!force && isSettled(get().monthStatus, yearMonth, 'amounts')) return;

    const tag = currentGeneration();
    set({ loading: true, monthStatus: setHalf(get().monthStatus, yearMonth, 'amounts', 'loading') });
    try {
      const amounts = await getApi().getMonthlyAmounts(yearMonth);
      const newMap = new Map(get().monthlyAmountsMap);
      const monthMap = new Map<number, number>();
      for (const a of amounts) {
        monthMap.set(a.templateId, a.amount);
      }
      newMap.set(yearMonth, monthMap);
      applyIfCurrent(tag, () =>
        set({
          monthlyAmountsMap: newMap,
          loading: false,
          monthStatus: setHalf(get().monthStatus, yearMonth, 'amounts', 'ready'),
        }),
      );
    } catch (e) {
      // 'error', not silence. An empty map is indistinguishable from a month the
      // household genuinely recorded nothing in, and 先月の予実 renders that as
      // 「実績が記録されていません」 -- a positive claim that would be false, and
      // permanently so, for a household whose data simply could not be fetched.
      applyIfCurrent(tag, () => {
        set({
          loading: false,
          monthStatus: setHalf(get().monthStatus, yearMonth, 'amounts', 'error'),
        });
        reportError(e);
      });
    }
  },

  fetchMonthlyAmountsRange: async (startMonth: string, endMonth: string, force = false) => {
    const tag = currentGeneration();
    const months = monthsInRange(startMonth, endMonth);

    // Nothing to do when every month is already loaded or on its way. Without
    // this the dashboard's two overlapping readiness hooks send the same request
    // twice on every load.
    if (!force) {
      const current = get().monthStatus;
      if (months.every((month) => isSettled(current, month, 'amounts'))) return;
    }

    set({ loading: true, monthStatus: setHalf(get().monthStatus, months, 'amounts', 'loading') });
    try {
      const amounts = await getApi().getMonthlyAmountsRange(startMonth, endMonth);
      const newMap = new Map(get().monthlyAmountsMap);

      // Clear existing entries in the range
      for (const [key] of newMap) {
        if (key >= startMonth && key <= endMonth) {
          newMap.delete(key);
        }
      }

      // Group by yearMonth
      for (const a of amounts) {
        if (!newMap.has(a.yearMonth)) {
          newMap.set(a.yearMonth, new Map<number, number>());
        }
        newMap.get(a.yearMonth)!.set(a.templateId, a.amount);
      }

      applyIfCurrent(tag, () =>
        set({
          monthlyAmountsMap: newMap,
          loading: false,
          monthStatus: setHalf(get().monthStatus, months, 'amounts', 'ready'),
        }),
      );
    } catch (e) {
      // Every month in the range is marked failed, not just "the fetch failed":
      // a projection built from a range with one month silently missing reads a
      // ¥500,000 rent as its ¥100,000 default and calls the result 余裕.
      applyIfCurrent(tag, () => {
        set({
          loading: false,
          monthStatus: setHalf(get().monthStatus, months, 'amounts', 'error'),
        });
        reportError(e);
      });
    }
  },

  setMonthlyAmount: async (templateId: number, yearMonth: string, amount: number) => {
    const previous = get().monthlyAmountsMap.get(yearMonth)?.get(templateId);
    // optimistic update
    const newMap = new Map(get().monthlyAmountsMap);
    const monthMap = new Map(newMap.get(yearMonth) ?? []);
    monthMap.set(templateId, amount);
    newMap.set(yearMonth, monthMap);
    set({ monthlyAmountsMap: newMap });

    // Tagged before the request; see src/app/ledger-generation.ts. Rolling the
    // optimistic edit back onto a map a ledger switch has already replaced would
    // restore the previous household's figures into this one's cache.
    const tag = currentGeneration();
    try {
      await getApi().setMonthlyAmount(templateId, yearMonth, amount);
      return isCurrent(tag);
    } catch (e) {
      applyIfCurrent(tag, () => {
        set({
          monthlyAmountsMap: revertEntry(
            get().monthlyAmountsMap, yearMonth, templateId, amount, previous,
          ),
        });
        reportError(e);
      });
      return false;
    }
  },

  deleteMonthlyAmount: async (templateId: number, yearMonth: string) => {
    const previous = get().monthlyAmountsMap.get(yearMonth)?.get(templateId);
    // optimistic removal
    const newMap = new Map(get().monthlyAmountsMap);
    const monthMap = newMap.get(yearMonth);
    if (monthMap) {
      const newMonthMap = new Map(monthMap);
      newMonthMap.delete(templateId);
      newMap.set(yearMonth, newMonthMap);
      set({ monthlyAmountsMap: newMap });
    }

    const tag = currentGeneration();
    try {
      await getApi().deleteMonthlyAmount(templateId, yearMonth);
      return isCurrent(tag);
    } catch (e) {
      applyIfCurrent(tag, () => {
        set({
          monthlyAmountsMap: revertEntry(
            get().monthlyAmountsMap, yearMonth, templateId, undefined, previous,
          ),
        });
        reportError(e);
      });
      return false;
    }
  },

  copyMonthlyAmounts: async (fromMonth: string, toMonth: string) => {
    const tag = currentGeneration();
    set({ loading: true });
    try {
      // WHICH entries get copied is the server's decision, made from the rows
      // under a lock. A list computed here would be stale the moment another tab
      // (or the other member of a shared ledger) changed a recurrence.
      await getApi().copyMonthlyAmounts(fromMonth, toMonth);
      // Re-fetch the target month to get the copied data
      const amounts = await getApi().getMonthlyAmounts(toMonth);
      const newMap = new Map(get().monthlyAmountsMap);
      const monthMap = new Map<number, number>();
      for (const a of amounts) {
        monthMap.set(a.templateId, a.amount);
      }
      newMap.set(toMonth, monthMap);
      return applyIfCurrent(tag, () => set({ monthlyAmountsMap: newMap, loading: false }));
    } catch (e) {
      // Covers BOTH failures deliberately: the copy itself, and the re-fetch
      // that proves what landed. A copy that succeeded but could not be read
      // back leaves the screen showing the previous month's figures, so
      // reporting success would be true about the database and false about
      // what the user is looking at.
      applyIfCurrent(tag, () => {
        set({ loading: false });
        reportError(e);
      });
      return false;
    }
  },

  fetchMonthlyActuals: async (yearMonth: string, force = false) => {
    if (!force && isSettled(get().monthStatus, yearMonth, 'actuals')) return;

    const tag = currentGeneration();
    set({ loading: true, monthStatus: setHalf(get().monthStatus, yearMonth, 'actuals', 'loading') });
    try {
      const actuals = await getApi().getMonthlyActuals(yearMonth);
      const newMap = new Map(get().monthlyActualsMap);
      const monthMap = new Map<number, number>();
      for (const a of actuals) {
        monthMap.set(a.templateId, a.actualAmount);
      }
      newMap.set(yearMonth, monthMap);
      applyIfCurrent(tag, () =>
        set({
          monthlyActualsMap: newMap,
          loading: false,
          monthStatus: setHalf(get().monthStatus, yearMonth, 'actuals', 'ready'),
        }),
      );
    } catch (e) {
      // See fetchMonthlyAmounts: silence here becomes 「実績が記録されていません」.
      applyIfCurrent(tag, () => {
        set({
          loading: false,
          monthStatus: setHalf(get().monthStatus, yearMonth, 'actuals', 'error'),
        });
        reportError(e);
      });
    }
  },

  setMonthlyActual: async (templateId: number, yearMonth: string, amount: number) => {
    const previous = get().monthlyActualsMap.get(yearMonth)?.get(templateId);
    // optimistic update
    const newMap = new Map(get().monthlyActualsMap);
    const monthMap = new Map(newMap.get(yearMonth) ?? []);
    monthMap.set(templateId, amount);
    newMap.set(yearMonth, monthMap);
    set({ monthlyActualsMap: newMap });

    const tag = currentGeneration();
    try {
      await getApi().setMonthlyActual(templateId, yearMonth, amount);
      return isCurrent(tag);
    } catch (e) {
      // Key-scoped, like the planned side: entering several actuals in quick
      // succession is ordinary, and a whole-map restore would undo the ones that
      // succeeded. See revertEntry.
      applyIfCurrent(tag, () => {
        set({
          monthlyActualsMap: revertEntry(
            get().monthlyActualsMap, yearMonth, templateId, amount, previous,
          ),
        });
        reportError(e);
      });
      return false;
    }
  },

  deleteMonthlyActual: async (templateId: number, yearMonth: string) => {
    const previous = get().monthlyActualsMap.get(yearMonth)?.get(templateId);
    // optimistic removal
    const newMap = new Map(get().monthlyActualsMap);
    const monthMap = newMap.get(yearMonth);
    if (monthMap) {
      const newMonthMap = new Map(monthMap);
      newMonthMap.delete(templateId);
      newMap.set(yearMonth, newMonthMap);
      set({ monthlyActualsMap: newMap });
    }

    const tag = currentGeneration();
    try {
      await getApi().deleteMonthlyActual(templateId, yearMonth);
      return isCurrent(tag);
    } catch (e) {
      applyIfCurrent(tag, () => {
        set({
          monthlyActualsMap: revertEntry(
            get().monthlyActualsMap, yearMonth, templateId, undefined, previous,
          ),
        });
        reportError(e);
      });
      return false;
    }
  },
}));

export function resolveAmount(
  templateId: number,
  yearMonth: string,
  monthlyAmountsMap: MonthlyAmountsMap,
  // `readonly` because this only ever reads. Requiring a mutable array forced
  // every caller holding a readonly list to copy it, for no reason.
  templates: readonly EntryTemplate[]
): number {
  const monthMap = monthlyAmountsMap.get(yearMonth);
  if (monthMap?.has(templateId)) {
    return monthMap.get(templateId)!;
  }
  const template = templates.find((t) => t.id === templateId);
  return template?.defaultAmount ?? 0;
}
