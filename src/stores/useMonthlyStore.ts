import { create } from 'zustand';
import type {
  EntryTemplate,
  MonthlyAmountsMap,
  MonthlyActualsMap,
} from '../types';
import { getApi } from '../lib/api';
import { reportError } from '../app/reportError';
import { applyIfCurrent, currentGeneration } from '../app/ledger-generation';
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
  fetchMonthlyAmounts: (yearMonth: string) => Promise<void>;
  fetchMonthlyAmountsRange: (startMonth: string, endMonth: string) => Promise<void>;
  setMonthlyAmount: (templateId: number, yearMonth: string, amount: number) => Promise<void>;
  deleteMonthlyAmount: (templateId: number, yearMonth: string) => Promise<void>;
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
  fetchMonthlyActuals: (yearMonth: string) => Promise<void>;
  setMonthlyActual: (templateId: number, yearMonth: string, amount: number) => Promise<void>;
  deleteMonthlyActual: (templateId: number, yearMonth: string) => Promise<void>;
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

  fetchMonthlyAmounts: async (yearMonth: string) => {
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

  fetchMonthlyAmountsRange: async (startMonth: string, endMonth: string) => {
    const tag = currentGeneration();
    const months = monthsInRange(startMonth, endMonth);
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
    const prevMap = get().monthlyAmountsMap;
    // optimistic update
    const newMap = new Map(prevMap);
    if (!newMap.has(yearMonth)) {
      newMap.set(yearMonth, new Map<number, number>());
    }
    const monthMap = new Map(newMap.get(yearMonth)!);
    monthMap.set(templateId, amount);
    newMap.set(yearMonth, monthMap);
    set({ monthlyAmountsMap: newMap });

    try {
      await getApi().setMonthlyAmount(templateId, yearMonth, amount);
    } catch (e) {
      set({ monthlyAmountsMap: prevMap });
      reportError(e);
    }
  },

  deleteMonthlyAmount: async (templateId: number, yearMonth: string) => {
    const prevMap = get().monthlyAmountsMap;
    // optimistic removal
    const newMap = new Map(prevMap);
    const monthMap = newMap.get(yearMonth);
    if (monthMap) {
      const newMonthMap = new Map(monthMap);
      newMonthMap.delete(templateId);
      newMap.set(yearMonth, newMonthMap);
      set({ monthlyAmountsMap: newMap });
    }

    try {
      await getApi().deleteMonthlyAmount(templateId, yearMonth);
    } catch (e) {
      set({ monthlyAmountsMap: prevMap });
      reportError(e);
    }
  },

  copyMonthlyAmounts: async (fromMonth: string, toMonth: string) => {
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
      set({ monthlyAmountsMap: newMap, loading: false });
      return true;
    } catch (e) {
      // Covers BOTH failures deliberately: the copy itself, and the re-fetch
      // that proves what landed. A copy that succeeded but could not be read
      // back leaves the screen showing the previous month's figures, so
      // reporting success would be true about the database and false about
      // what the user is looking at.
      set({ loading: false });
      reportError(e);
      return false;
    }
  },

  fetchMonthlyActuals: async (yearMonth: string) => {
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
    const prevMap = get().monthlyActualsMap;
    // optimistic update
    const newMap = new Map(prevMap);
    if (!newMap.has(yearMonth)) {
      newMap.set(yearMonth, new Map<number, number>());
    }
    const monthMap = new Map(newMap.get(yearMonth)!);
    monthMap.set(templateId, amount);
    newMap.set(yearMonth, monthMap);
    set({ monthlyActualsMap: newMap });

    try {
      await getApi().setMonthlyActual(templateId, yearMonth, amount);
    } catch (e) {
      set({ monthlyActualsMap: prevMap });
      reportError(e);
    }
  },

  deleteMonthlyActual: async (templateId: number, yearMonth: string) => {
    const prevMap = get().monthlyActualsMap;
    // optimistic removal
    const newMap = new Map(prevMap);
    const monthMap = newMap.get(yearMonth);
    if (monthMap) {
      const newMonthMap = new Map(monthMap);
      newMonthMap.delete(templateId);
      newMap.set(yearMonth, newMonthMap);
      set({ monthlyActualsMap: newMap });
    }

    try {
      await getApi().deleteMonthlyActual(templateId, yearMonth);
    } catch (e) {
      set({ monthlyActualsMap: prevMap });
      reportError(e);
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
