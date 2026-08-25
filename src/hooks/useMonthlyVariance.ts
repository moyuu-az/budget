import { useEffect, useMemo } from 'react';
import { useTemplateStore } from '../stores/useTemplateStore';
import { useCategoryStore } from '../stores/useCategoryStore';
import { useMonthlyStore } from '../stores/useMonthlyStore';
import { combineStatus, type LoadStatus } from '../stores/load-status';
import { previousMonth, summarizeVariance, type MonthlyVariance } from '../utils/variance';

// ---------------------------------------------------------------------------
// Did last month go the way it was planned?
//
// The application has recorded actuals since before this change, and the only
// place they appeared was 分析. Anyone who reaches 分析 is already thinking
// about their spending; the household that needs to hear 「先月は予算より
// ¥32,000 多く使いました」 is the one that opens the dashboard and leaves.
//
// WHY IT FETCHES ITS OWN MONTH
//   The dashboard fetches monthly amounts from THIS month forward, for the
//   forecast. Last month is behind that range and behind the actuals range too,
//   so nothing else was going to load it. Fetching here keeps the card
//   self-contained: no other component has to know it exists in order for it to
//   work.
// ---------------------------------------------------------------------------

export interface MonthlyVarianceResult {
  variance: MonthlyVariance;
  status: LoadStatus;
}

export function useMonthlyVariance(): MonthlyVarianceResult {
  const templates = useTemplateStore((s) => s.templates);
  const templatesStatus = useTemplateStore((s) => s.status);
  const categories = useCategoryStore((s) => s.categories);
  const amountsMap = useMonthlyStore((s) => s.monthlyAmountsMap);
  const actualsMap = useMonthlyStore((s) => s.monthlyActualsMap);
  const fetchMonthlyAmounts = useMonthlyStore((s) => s.fetchMonthlyAmounts);
  const fetchMonthlyActuals = useMonthlyStore((s) => s.fetchMonthlyActuals);

  // Read once per render rather than per effect: two reads either side of
  // midnight would disagree about which month "last month" is, and the fetch
  // would then be for a month the summary does not read.
  const yearMonth = useMemo(() => previousMonth(new Date()), []);

  useEffect(() => {
    void fetchMonthlyAmounts(yearMonth);
    void fetchMonthlyActuals(yearMonth);
  }, [yearMonth, fetchMonthlyAmounts, fetchMonthlyActuals]);

  // Readiness is the TEMPLATES', not the amounts'. Both maps start empty and
  // stay empty for a household that has recorded nothing, so "empty" cannot
  // stand in for "not fetched" -- and the honest answer for that household is a
  // card saying nothing has been recorded, which is what `recordedCount: 0`
  // already expresses.
  const status = combineStatus(templatesStatus);

  const variance = useMemo(
    () =>
      summarizeVariance(templates, categories, amountsMap, actualsMap, yearMonth, 'expense'),
    [templates, categories, amountsMap, actualsMap, yearMonth],
  );

  return { variance, status };
}
