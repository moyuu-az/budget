import { create } from 'zustand';
import type {
  ActualWithCategory,
  EntryTemplate,
  MonthlyAmountsMap,
  MonthlyActualsMap,
} from '../types';

interface MonthlyState {
  monthlyAmountsMap: MonthlyAmountsMap;
  monthlyActualsMap: MonthlyActualsMap;
  actualsWithCategory: ActualWithCategory[];
  loading: boolean;
  error: string | null;
  fetchActualsRange: (startMonth: string, endMonth: string) => Promise<void>;
  fetchMonthlyAmounts: (yearMonth: string) => Promise<void>;
  fetchMonthlyAmountsRange: (startMonth: string, endMonth: string) => Promise<void>;
  setMonthlyAmount: (templateId: number, yearMonth: string, amount: number) => Promise<void>;
  deleteMonthlyAmount: (templateId: number, yearMonth: string) => Promise<void>;
  copyMonthlyAmounts: (fromMonth: string, toMonth: string) => Promise<void>;
  fetchMonthlyActuals: (yearMonth: string) => Promise<void>;
  setMonthlyActual: (templateId: number, yearMonth: string, amount: number) => Promise<void>;
  deleteMonthlyActual: (templateId: number, yearMonth: string) => Promise<void>;
}

export const useMonthlyStore = create<MonthlyState>((set, get) => ({
  monthlyAmountsMap: new Map(),
  monthlyActualsMap: new Map(),
  actualsWithCategory: [],
  loading: false,
  error: null,

  fetchActualsRange: async (startMonth: string, endMonth: string) => {
    set({ loading: true, error: null });
    try {
      const actuals = await window.electronAPI.getMonthlyActualsRange(startMonth, endMonth);
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
      set({ actualsWithCategory: actuals, monthlyActualsMap: newMap, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  fetchMonthlyAmounts: async (yearMonth: string) => {
    set({ loading: true, error: null });
    try {
      const amounts = await window.electronAPI.getMonthlyAmounts(yearMonth);
      const newMap = new Map(get().monthlyAmountsMap);
      const monthMap = new Map<number, number>();
      for (const a of amounts) {
        monthMap.set(a.templateId, a.amount);
      }
      newMap.set(yearMonth, monthMap);
      set({ monthlyAmountsMap: newMap, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  fetchMonthlyAmountsRange: async (startMonth: string, endMonth: string) => {
    set({ loading: true, error: null });
    try {
      const amounts = await window.electronAPI.getMonthlyAmountsRange(startMonth, endMonth);
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
      set({ error: (e as Error).message, loading: false });
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
      await window.electronAPI.setMonthlyAmount(templateId, yearMonth, amount);
    } catch (e) {
      set({ monthlyAmountsMap: prevMap, error: (e as Error).message });
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
      await window.electronAPI.deleteMonthlyAmount(templateId, yearMonth);
    } catch (e) {
      set({ monthlyAmountsMap: prevMap, error: (e as Error).message });
    }
  },

  copyMonthlyAmounts: async (fromMonth: string, toMonth: string) => {
    set({ loading: true, error: null });
    try {
      await window.electronAPI.copyMonthlyAmounts(fromMonth, toMonth);
      // Re-fetch the target month to get the copied data
      const amounts = await window.electronAPI.getMonthlyAmounts(toMonth);
      const newMap = new Map(get().monthlyAmountsMap);
      const monthMap = new Map<number, number>();
      for (const a of amounts) {
        monthMap.set(a.templateId, a.amount);
      }
      newMap.set(toMonth, monthMap);
      set({ monthlyAmountsMap: newMap, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  fetchMonthlyActuals: async (yearMonth: string) => {
    set({ loading: true, error: null });
    try {
      const actuals = await window.electronAPI.getMonthlyActuals(yearMonth);
      const newMap = new Map(get().monthlyActualsMap);
      const monthMap = new Map<number, number>();
      for (const a of actuals) {
        monthMap.set(a.templateId, a.actualAmount);
      }
      newMap.set(yearMonth, monthMap);
      set({ monthlyActualsMap: newMap, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
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
      await window.electronAPI.setMonthlyActual(templateId, yearMonth, amount);
    } catch (e) {
      set({ monthlyActualsMap: prevMap, error: (e as Error).message });
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
      await window.electronAPI.deleteMonthlyActual(templateId, yearMonth);
    } catch (e) {
      set({ monthlyActualsMap: prevMap, error: (e as Error).message });
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
