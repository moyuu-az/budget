import { useMemo } from 'react';
import { useTemplateStore } from '../stores/useTemplateStore';
import { useCategoryStore } from '../stores/useCategoryStore';
import { useMonthlyStore } from '../stores/useMonthlyStore';
import { buildCashFlowData, type CashFlowData } from '../utils/cashflow';

// Derives the Sankey cash-flow graph for a month from the current store state.
// Returns null when there are no enabled templates (matches buildCashFlowData).
export function useCashFlowData(yearMonth: string): CashFlowData | null {
  const templates = useTemplateStore((s) => s.templates);
  const categories = useCategoryStore((s) => s.categories);
  const monthlyAmountsMap = useMonthlyStore((s) => s.monthlyAmountsMap);

  return useMemo(
    () => buildCashFlowData(templates, monthlyAmountsMap, categories, yearMonth),
    [templates, monthlyAmountsMap, categories, yearMonth],
  );
}
