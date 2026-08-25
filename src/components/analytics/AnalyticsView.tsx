import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useTemplateStore } from '../../stores/useTemplateStore';
import { useCategoryStore } from '../../stores/useCategoryStore';
import { useMonthlyStore } from '../../stores/useMonthlyStore';
import { useSnapshotStore } from '../../stores/useSnapshotStore';
import { useUIStore } from '../../stores/useUIStore';
import type { AnalyticsPeriod } from '../../types/ui';
import { toYearMonth } from '../../utils/forecast';
import { useForecast } from '../../hooks/useForecast';
import {
  buildCategoryTrend,
  buildCompositionData,
  buildComparisonData,
  generateMonthRange,
} from '../../utils/analytics';
import PeriodSelector from './PeriodSelector';
import TimelineChart from './TimelineChart';
import CategoryTrendChart from './CategoryTrendChart';
import CompositionChart from './CompositionChart';
import ComparisonTable from './ComparisonTable';
import { useMonthRangeLoaded } from '../../hooks/useMonthLoaded';

const periodOptions: Array<{ value: AnalyticsPeriod; label: string }> = [
  { value: '3m', label: '3ヶ月' },
  { value: '6m', label: '6ヶ月' },
  { value: '1y', label: '1年' },
];

function AnalyticsView() {
  const period = useUIStore((s) => s.analyticsPeriod);
  const setAnalyticsPeriod = useUIStore((s) => s.setAnalyticsPeriod);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);

  const templates = useTemplateStore((s) => s.templates);
  const categories = useCategoryStore((s) => s.categories);
  const monthlyAmountsMap = useMonthlyStore((s) => s.monthlyAmountsMap);
  const monthlyActualsMap = useMonthlyStore((s) => s.monthlyActualsMap);
  const snapshots = useSnapshotStore((s) => s.snapshots);

  const now = useMemo(() => new Date(), []);
  const todayYearMonth = useMemo(() => toYearMonth(now), [now]);

  // Compute date ranges
  const { startMonth, endMonth, pastStartDate } = useMemo(() => {
    const months = period === '3m' ? 3 : period === '6m' ? 6 : 12;
    const pastStart = new Date(now.getFullYear(), now.getMonth() - months, 1);
    const futureEnd = new Date(now.getFullYear(), now.getMonth() + months, 0);
    return {
      startMonth: toYearMonth(pastStart),
      endMonth: toYearMonth(futureEnd),
      pastStartDate: pastStart.toISOString().split('T')[0],
    };
  }, [now, period]);

  // Loads the span this view plots -- planned figures across the whole range,
  // recorded actuals only up to today.
  //
  // Through the shared hook, which carries the ACTIVE LEDGER in its
  // dependencies. This view does NOT gate on readiness (see below), so without
  // it a ledger switch left both maps empty and the charts went on drawing:
  // planned amounts silently falling back to template defaults and every month
  // shown as having no actuals at all. A household that records its actuals
  // would have been told, positively, that it does not.
  useMonthRangeLoaded(startMonth, endMonth, todayYearMonth);

  // Forecast
  const forecastDays = useMemo(() => {
    const months = period === '3m' ? 3 : period === '6m' ? 6 : 12;
    return months * 31;
  }, [period]);

  // Readiness is not gated on here: this view plots the projection beside past
  // months rather than raising a warning from it, so an empty series while the
  // data lands reads as "nothing yet" instead of as an alarm.
  const { points: forecast } = useForecast(forecastDays);

  const filteredSnapshots = useMemo(
    () => snapshots.filter((s) => s.date >= pastStartDate),
    [snapshots, pastStartDate],
  );

  const months = useMemo(
    () => generateMonthRange(startMonth, endMonth),
    [startMonth, endMonth],
  );

  const activeMonth = selectedMonth ?? todayYearMonth;

  // Trends resolve each month's amount as actual ?? planned, so past/current months stay
  // populated from planned amounts when no actuals were recorded. Type is filtered inside
  // the builder, so no post-filtering is needed here.
  const expenseTrend = useMemo(
    () => buildCategoryTrend(templates, categories, monthlyAmountsMap, monthlyActualsMap, months, 'expense'),
    [templates, categories, monthlyAmountsMap, monthlyActualsMap, months],
  );

  const incomeTrend = useMemo(
    () => buildCategoryTrend(templates, categories, monthlyAmountsMap, monthlyActualsMap, months, 'income'),
    [templates, categories, monthlyAmountsMap, monthlyActualsMap, months],
  );

  const composition = useMemo(
    () => buildCompositionData(templates, categories, monthlyAmountsMap, monthlyActualsMap, activeMonth, 'expense'),
    [templates, categories, monthlyAmountsMap, monthlyActualsMap, activeMonth],
  );

  const comparison = useMemo(
    () => buildComparisonData(expenseTrend, activeMonth),
    [expenseTrend, activeMonth],
  );

  return (
    <motion.div
      className="space-y-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      {/* Wraps: the period selector is four buttons wide. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-white">分析</h1>
        <PeriodSelector
          options={periodOptions}
          selected={period}
          onChange={(v) => { setAnalyticsPeriod(v); setSelectedMonth(null); }}
        />
      </div>

      <TimelineChart snapshots={filteredSnapshots} forecast={forecast} />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <CategoryTrendChart data={expenseTrend} todayYearMonth={todayYearMonth} type="expense" onMonthClick={setSelectedMonth} />
        <CategoryTrendChart data={incomeTrend} todayYearMonth={todayYearMonth} type="income" onMonthClick={setSelectedMonth} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CompositionChart data={composition} yearMonth={activeMonth} />
        <ComparisonTable data={comparison} yearMonth={activeMonth} />
      </div>
    </motion.div>
  );
}

export default AnalyticsView;
