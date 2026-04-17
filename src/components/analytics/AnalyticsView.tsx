import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useBalanceStore } from '../../stores/useBalanceStore';
import { useTemplateStore } from '../../stores/useTemplateStore';
import { useCategoryStore } from '../../stores/useCategoryStore';
import { useMonthlyStore } from '../../stores/useMonthlyStore';
import { useSnapshotStore } from '../../stores/useSnapshotStore';
import { generateForecast, toYearMonth } from '../../utils/forecast';
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

const periodOptions = [
  { value: '3m', label: '3ヶ月' },
  { value: '6m', label: '6ヶ月' },
  { value: '1y', label: '1年' },
];

function AnalyticsView() {
  const [period, setPeriod] = useState('6m');
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);

  const balance = useBalanceStore((s) => s.balance);
  const templates = useTemplateStore((s) => s.templates);
  const categories = useCategoryStore((s) => s.categories);
  const monthlyAmountsMap = useMonthlyStore((s) => s.monthlyAmountsMap);
  const actualsWithCategory = useMonthlyStore((s) => s.actualsWithCategory);
  const fetchMonthlyAmountsRange = useMonthlyStore((s) => s.fetchMonthlyAmountsRange);
  const fetchActualsRange = useMonthlyStore((s) => s.fetchActualsRange);
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

  // Fetch data
  useEffect(() => {
    fetchMonthlyAmountsRange(startMonth, endMonth);
    fetchActualsRange(startMonth, todayYearMonth);
  }, [fetchMonthlyAmountsRange, fetchActualsRange, startMonth, endMonth, todayYearMonth]);

  // Forecast
  const forecastDays = useMemo(() => {
    const months = period === '3m' ? 3 : period === '6m' ? 6 : 12;
    return months * 31;
  }, [period]);

  const forecast = useMemo(
    () => generateForecast(balance, templates, monthlyAmountsMap, forecastDays),
    [balance, templates, monthlyAmountsMap, forecastDays],
  );

  const filteredSnapshots = useMemo(
    () => snapshots.filter((s) => s.date >= pastStartDate),
    [snapshots, pastStartDate],
  );

  const months = useMemo(
    () => generateMonthRange(startMonth, endMonth),
    [startMonth, endMonth],
  );

  const activeMonth = selectedMonth ?? todayYearMonth;

  // Build trend data with type filtering
  const fullTrend = useMemo(
    () => buildCategoryTrend(actualsWithCategory, templates, categories, monthlyAmountsMap, months, todayYearMonth),
    [actualsWithCategory, templates, categories, monthlyAmountsMap, months, todayYearMonth],
  );

  // Split trends by type
  const expenseTrend = useMemo(() => {
    return fullTrend.map((point) => ({
      ...point,
      categories: point.categories.filter((c) => {
        const actual = actualsWithCategory.find(
          (a) => a.yearMonth === point.yearMonth && a.categoryId === c.categoryId,
        );
        if (actual) return actual.templateType === 'expense';
        return templates.some((t) => t.categoryId === c.categoryId && t.type === 'expense');
      }),
    }));
  }, [fullTrend, actualsWithCategory, templates]);

  const incomeTrend = useMemo(() => {
    return fullTrend.map((point) => ({
      ...point,
      categories: point.categories.filter((c) => {
        const actual = actualsWithCategory.find(
          (a) => a.yearMonth === point.yearMonth && a.categoryId === c.categoryId,
        );
        if (actual) return actual.templateType === 'income';
        return templates.some((t) => t.categoryId === c.categoryId && t.type === 'income');
      }),
    }));
  }, [fullTrend, actualsWithCategory, templates]);

  const composition = useMemo(
    () => buildCompositionData(actualsWithCategory, templates, categories, monthlyAmountsMap, activeMonth, todayYearMonth, 'expense'),
    [actualsWithCategory, templates, categories, monthlyAmountsMap, activeMonth, todayYearMonth],
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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">分析</h1>
        <PeriodSelector
          options={periodOptions}
          selected={period}
          onChange={(v) => { setPeriod(v); setSelectedMonth(null); }}
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
