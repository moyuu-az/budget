import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  EntryTemplate,
  EntryTemplateInput,
  MonthlyAmount,
  MonthlyAmountsMap,
  BalanceSnapshot
} from '../types';
import { toYearMonth } from '../utils/forecast';

function buildAmountsMap(amounts: MonthlyAmount[]): MonthlyAmountsMap {
  const map: MonthlyAmountsMap = new Map();
  for (const a of amounts) {
    let monthMap = map.get(a.yearMonth);
    if (!monthMap) {
      monthMap = new Map();
      map.set(a.yearMonth, monthMap);
    }
    monthMap.set(a.templateId, a.amount);
  }
  return map;
}

export function useDatabase() {
  const [balance, setBalanceState] = useState<number>(0);
  const [templates, setTemplates] = useState<EntryTemplate[]>([]);
  const [monthlyAmountsMap, setMonthlyAmountsMap] = useState<MonthlyAmountsMap>(new Map());
  const [snapshots, setSnapshots] = useState<BalanceSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const forecastAmountsLoaded = useRef(false);

  const loadForecastAmounts = useCallback(async () => {
    const today = new Date();
    const startMonth = toYearMonth(today);
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + 60);
    const endMonth = toYearMonth(endDate);

    const amounts = await window.electronAPI.getMonthlyAmountsRange(startMonth, endMonth);
    setMonthlyAmountsMap(buildAmountsMap(amounts));
  }, []);

  const refresh = useCallback(async () => {
    const [bal, tmpl, snap] = await Promise.all([
      window.electronAPI.getBalance(),
      window.electronAPI.getTemplates(),
      window.electronAPI.getSnapshots()
    ]);
    setBalanceState(bal);
    setTemplates(tmpl);
    setSnapshots(snap);
    await loadForecastAmounts();
    setLoading(false);
    forecastAmountsLoaded.current = true;
  }, [loadForecastAmounts]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const setBalance = useCallback(async (newBalance: number) => {
    await window.electronAPI.setBalance(newBalance);
    setBalanceState(newBalance);
  }, []);

  // Template operations
  const addTemplate = useCallback(async (template: EntryTemplateInput) => {
    const created = await window.electronAPI.addTemplate(template);
    setTemplates((prev) => [...prev, created]);
    return created;
  }, []);

  const updateTemplate = useCallback(async (id: number, template: Partial<EntryTemplateInput>) => {
    await window.electronAPI.updateTemplate(id, template);
    setTemplates((prev) => prev.map((t) => (t.id === id ? { ...t, ...template } : t)));
  }, []);

  const deleteTemplate = useCallback(async (id: number) => {
    await window.electronAPI.deleteTemplate(id);
    setTemplates((prev) => prev.filter((t) => t.id !== id));
    setMonthlyAmountsMap((prev) => {
      const next = new Map(prev);
      for (const [ym, monthMap] of next) {
        if (monthMap.has(id)) {
          const newMonthMap = new Map(monthMap);
          newMonthMap.delete(id);
          next.set(ym, newMonthMap);
        }
      }
      return next;
    });
  }, []);

  const toggleTemplate = useCallback(async (id: number, enabled: boolean) => {
    await window.electronAPI.toggleTemplate(id, enabled);
    setTemplates((prev) => prev.map((t) => (t.id === id ? { ...t, enabled } : t)));
  }, []);

  // Monthly amount operations
  const setMonthlyAmount = useCallback(async (templateId: number, yearMonth: string, amount: number) => {
    const created = await window.electronAPI.setMonthlyAmount(templateId, yearMonth, amount);
    setMonthlyAmountsMap((prev) => {
      const next = new Map(prev);
      let monthMap = next.get(yearMonth);
      if (!monthMap) {
        monthMap = new Map();
      } else {
        monthMap = new Map(monthMap);
      }
      monthMap.set(templateId, amount);
      next.set(yearMonth, monthMap);
      return next;
    });
    return created;
  }, []);

  const deleteMonthlyAmount = useCallback(async (templateId: number, yearMonth: string) => {
    await window.electronAPI.deleteMonthlyAmount(templateId, yearMonth);
    setMonthlyAmountsMap((prev) => {
      const next = new Map(prev);
      const monthMap = next.get(yearMonth);
      if (monthMap) {
        const newMonthMap = new Map(monthMap);
        newMonthMap.delete(templateId);
        next.set(yearMonth, newMonthMap);
      }
      return next;
    });
  }, []);

  const copyMonthlyAmounts = useCallback(async (fromMonth: string, toMonth: string) => {
    const copied = await window.electronAPI.copyMonthlyAmounts(fromMonth, toMonth);
    setMonthlyAmountsMap((prev) => {
      const next = new Map(prev);
      let monthMap = next.get(toMonth);
      if (!monthMap) {
        monthMap = new Map();
      } else {
        monthMap = new Map(monthMap);
      }
      for (const a of copied) {
        monthMap.set(a.templateId, a.amount);
      }
      next.set(toMonth, monthMap);
      return next;
    });
    return copied;
  }, []);

  const getMonthlyAmountsForMonth = useCallback(async (yearMonth: string) => {
    const amounts = await window.electronAPI.getMonthlyAmounts(yearMonth);
    setMonthlyAmountsMap((prev) => {
      const next = new Map(prev);
      const monthMap = new Map<number, number>();
      for (const a of amounts) {
        monthMap.set(a.templateId, a.amount);
      }
      next.set(yearMonth, monthMap);
      return next;
    });
    return amounts;
  }, []);

  // Snapshot operations
  const addSnapshot = useCallback(async (date: string, balance: number) => {
    const created = await window.electronAPI.addSnapshot(date, balance);
    setSnapshots((prev) => {
      const filtered = prev.filter((s) => s.date !== created.date);
      return [created, ...filtered].sort((a, b) => b.date.localeCompare(a.date));
    });
    return created;
  }, []);

  const deleteSnapshot = useCallback(async (id: number) => {
    await window.electronAPI.deleteSnapshot(id);
    setSnapshots((prev) => prev.filter((s) => s.id !== id));
  }, []);

  return {
    balance,
    templates,
    monthlyAmountsMap,
    snapshots,
    loading,
    refresh,
    setBalance,
    addTemplate,
    updateTemplate,
    deleteTemplate,
    toggleTemplate,
    setMonthlyAmount,
    deleteMonthlyAmount,
    copyMonthlyAmounts,
    getMonthlyAmountsForMonth,
    loadForecastAmounts,
    addSnapshot,
    deleteSnapshot
  };
}
