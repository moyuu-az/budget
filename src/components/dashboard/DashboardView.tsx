import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import type { ForecastPeriod, ViewType } from '../../types';
import { useDashboardReadiness } from '../../hooks/useDashboardReadiness';
import { periodToDays } from '../../utils/forecast';
import { LoadGate } from '../ui/LoadGate';
import ForecastChart from './ForecastChart';
import KpiHero from './KpiHero';
import HoldingsCard from './HoldingsCard';
import MinBalanceCard from './MinBalanceCard';
import SankeyChart from './SankeyChart';
import UpcomingEvents from './UpcomingEvents';
import VarianceCard from './VarianceCard';

interface DashboardViewProps {
  onNavigate?: (view: ViewType) => void;
}

function DashboardView({ onNavigate }: DashboardViewProps) {
  const [forecastPeriod, setForecastPeriod] = useState<ForecastPeriod>('60d');

  // The month range is fetched by useDashboardReadiness, not here.
  //
  // It used to be this component's effect, and the two immediately disagreed:
  // this asked for the SELECTED period while KpiHero waited on a fixed 90 days,
  // so on the default 60-day view the extra month was fetched by nobody and the
  // KPI row spun forever. Whatever decides what to wait for has to be what asks
  // for it.

  // ONE readiness for every panel here, decided in one place.
  //
  // It is not cosmetic: with real expenses and a not-yet-loaded ¥0 balance every
  // figure below reads 残高不足 in red, and with a not-yet-loaded floor the
  // chart draws its reference line somewhere the household never put it. EVERY
  // panel that states something about money goes through LoadGate on THIS status
  // -- an ungated one shows its empty state, and the empty states here are
  // positive claims ("nothing is coming up") rather than blanks.
  //
  // See useDashboardReadiness for what it waits for and why gating per panel is
  // what produced two contradictory answers on one screen.
  const { status, points: forecast, retry } = useDashboardReadiness(periodToDays(forecastPeriod));

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
      {/* KPI hero - first row */}
      <KpiHero />

      {/* What is held right now. Renders nothing when 資産 is unused, and its
          cash/net-worth toggle reaches only this card -- everything below stays
          cash, because that is what the forecast is about. */}
      <HoldingsCard />

      {/* Forecast Chart - full width */}
      <LoadGate status={status} height={360} label="残高予測" onRetry={retry}>
        <ForecastChart
          data={forecast}
          minimumPoint={minimumPoint}
          period={forecastPeriod}
          onPeriodChange={setForecastPeriod}
          onOpenAnalytics={onNavigate ? () => onNavigate('analytics') : undefined}
        />
      </LoadGate>

      {/* 最低残高予測 + 先月の予実, side by side.

          先月の予実 sits here rather than in the KPI row because it is about the
          PAST: the row above answers "what do I do now", and mixing a
          retrospective figure into it would blunt that. It is still above the
          fold, which is the point -- it lived only in 分析, and anyone who
          reaches 分析 is already thinking about their spending. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <LoadGate status={status} height={148} label="最低残高予測" onRetry={retry}>
          <MinBalanceCard point={minimumPoint} daysUntil={daysUntilMinimum} />
        </LoadGate>
        <VarianceCard />
      </div>

      {/* THE FLOW DIAGRAM GETS THE WHOLE ROW, and that is a requirement rather
          than a preference.

          It draws labelled bands between two columns of nodes, so its side
          margins carry Japanese category names and are not optional. Squeezed
          into a third of a three-column row it had about 54px left for the
          diagram itself and rendered nothing at all -- silently, because the
          card's heading and totals still drew. That is how it was added beside
          先月の予実 without anyone noticing the graph had gone.

          SankeyCanvas now says so instead of vanishing, but the fix for THIS
          screen is to give it the width it needs. */}
      <SankeyChart />

      {/* Upcoming Events - full width */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.4 }}
      >
        {/* Gated like the rest: its empty state says 「14日以内の予定はありません」,
            which an empty-because-not-loaded list turns into a false statement
            about the user's month. */}
        <LoadGate status={status} height={200} label="今後の予定" onRetry={retry}>
          <UpcomingEvents events={forecast} />
        </LoadGate>
      </motion.div>
    </motion.div>
  );
}

export default DashboardView;
