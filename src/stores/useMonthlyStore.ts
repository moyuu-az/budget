import { create } from 'zustand';
import type {
  EntryTemplate,
  MonthlyAmountsMap,
  MonthlyActualsMap,
} from '../types';
import { getApi } from '../lib/api';
import { reportError } from '../app/reportError';

interface MonthlyState {
  monthlyAmountsMap: MonthlyAmountsMap;
  monthlyActualsMap: MonthlyActualsMap;
  loading: boolean;
  reset: () => void;
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
  copyMonthlyAmounts: (fromMonth: string, toMonth: string, templateIds: number[]) => Promise<boolean>;
  fetchMonthlyActuals: (yearMonth: string) => Promise<void>;
  setMonthlyActual: (templateId: number, yearMonth: string, amount: number) => Promise<void>;
  deleteMonthlyActual: (templateId: number, yearMonth: string) => Promise<void>;
}

export const useMonthlyStore = create<MonthlyState>((set, get) => ({
  monthlyAmountsMap: new Map(),
  monthlyActualsMap: new Map(),
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
    set({ monthlyAmountsMap: new Map(), monthlyActualsMap: new Map(), loading: false }),

  fetchActualsRange: async (startMonth: string, endMonth: string) => {
    set({ loading: true });
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
      set({ monthlyActualsMap: newMap, loading: false });
    } catch (e) {
      set({ loading: false });
      reportError(e);
    }
  },

  fetchMonthlyAmounts: async (yearMonth: string) => {
    set({ loading: true });
    try {
      const amounts = await getApi().getMonthlyAmounts(yearMonth);
      const newMap = new Map(get().monthlyAmountsMap);
      const monthMap = new Map<number, number>();
      for (const a of amounts) {
        monthMap.set(a.templateId, a.amount);
      }
      newMap.set(yearMonth, monthMap);
      set({ monthlyAmountsMap: newMap, loading: false });
    } catch (e) {
      set({ loading: false });
      reportError(e);
    }
  },

  fetchMonthlyAmountsRange: async (startMonth: string, endMonth: string) => {
    set({ loading: true });
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

      set({ monthlyAmountsMap: newMap, loading: false });
    } catch (e) {
      set({ loading: false });
      reportError(e);
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

  copyMonthlyAmounts: async (fromMonth: string, toMonth: string, templateIds: number[]) => {
    set({ loading: true });
    try {
      // `templateIds` is the caller's list of entries that actually occur in the
      // TARGET month. Copying anything else stores an override no screen can
      // show and no total reads -- until the recurrence changes to include that
      // month, at which point it silently wins. See AppApi.copyMonthlyAmounts.
      await getApi().copyMonthlyAmounts(fromMonth, toMonth, templateIds);
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
    set({ loading: true });
    try {
      const actuals = await getApi().getMonthlyActuals(yearMonth);
      const newMap = new Map(get().monthlyActualsMap);
      const monthMap = new Map<number, number>();
      for (const a of actuals) {
        monthMap.set(a.templateId, a.actualAmount);
      }
      newMap.set(yearMonth, monthMap);
      set({ monthlyActualsMap: newMap, loading: false });
    } catch (e) {
      set({ loading: false });
      reportError(e);
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
  templates: EntryTemplate[]
): number {
  const monthMap = monthlyAmountsMap.get(yearMonth);
  if (monthMap?.has(templateId)) {
    return monthMap.get(templateId)!;
  }
  const template = templates.find((t) => t.id === templateId);
  return template?.defaultAmount ?? 0;
}
