import { useMemo, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import type { ForecastPeriod, ViewType } from '../../types';
import { useBalanceStore } from '../../stores/useBalanceStore';
import { useTemplateStore } from '../../stores/useTemplateStore';
import { useMonthlyStore } from '../../stores/useMonthlyStore';
import { generateForecast, toYearMonth, periodToDays, periodToMonths } from '../../utils/forecast';
import ForecastChart from './ForecastChart';
import MinBalanceCard from './MinBalanceCard';
import SankeyChart from './SankeyChart';
import UpcomingEvents from './UpcomingEvents';

interface DashboardViewProps {
  onNavigate?: (view: ViewType) => void;
}

function DashboardView({ onNavigate }: DashboardViewProps) {
  const [forecastPeriod, setForecastPeriod] = useState<ForecastPeriod>('60d');
  const balance = useBalanceStore((s) => s.balance);
  const templates = useTemplateStore((s) => s.templates);
  const monthlyAmountsMap = useMonthlyStore((s) => s.monthlyAmountsMap);
  const fetchMonthlyAmountsRange = useMonthlyStore((s) => s.fetchMonthlyAmountsRange);

  // Fetch monthly amounts for forecast range (current + dynamic months)
  // Base data (balance, templates, categories) is fetched by App.tsx on mount
  useEffect(() => {
    const now = new Date();
    const startMonth = toYearMonth(now);
    const endDate = new Date(now.getFullYear(), now.getMonth() + periodToMonths(forecastPeriod) + 1, 0);
    const endMonth = toYearMonth(endDate);
    fetchMonthlyAmountsRange(startMonth, endMonth);
  }, [fetchMonthlyAmountsRange, forecastPeriod]);

  // Compute forecast data
  const forecast = useMemo(
    () => generateForecast(balance, templates, monthlyAmountsMap, periodToDays(forecastPeriod)),
    [balance, templates, monthlyAmountsMap, forecastPeriod]
  );

  const minimumPoint = useMemo(
    () => forecast.find((p) => p.isMinimum) ?? null,
    [forecast]
  );

  const daysUntilMinimum = useMemo(() => {
    if (!minimumPoint) return 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const minDate = new Date(minimumPoint.date);
    return Math.round((minDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  }, [minimumPoint]);

  return (
    <motion.div
      className="space-y-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      {/* Forecast Chart - full width */}
      <ForecastChart
        data={forecast}
        minimumPoint={minimumPoint}
        period={forecastPeriod}
        onPeriodChange={setForecastPeriod}
        onOpenAnalytics={onNavigate ? () => onNavigate('analytics') : undefined}
      />

      {/* MinBalanceCard (1/3) + SankeyChart (2/3) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <MinBalanceCard point={minimumPoint} daysUntil={daysUntilMinimum} />
        <div className="lg:col-span-2">
          <SankeyChart />
        </div>
      </div>

      {/* Upcoming Events - full width */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.4 }}
      >
        <UpcomingEvents events={forecast} />
      </motion.div>
    </motion.div>
  );
}

export default DashboardView;
