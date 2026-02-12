import { motion } from 'framer-motion';
import CountUp from 'react-countup';
import type { EntryTemplate, MonthlyAmountsMap } from '../types';
import { useForecast } from '../hooks/useForecast';
import BalanceDisplay from './BalanceDisplay';
import ForecastChart from './ForecastChart';
import UpcomingEvents from './UpcomingEvents';

interface DashboardProps {
  balance: number;
  templates: EntryTemplate[];
  monthlyAmountsMap: MonthlyAmountsMap;
  onUpdateBalance: (balance: number) => Promise<void>;
}

function Dashboard({ balance, templates, monthlyAmountsMap, onUpdateBalance }: DashboardProps) {
  const { forecast, minimumPoint, upcomingEvents } = useForecast(balance, templates, monthlyAmountsMap);

  const activeCount = templates.filter((t) => t.enabled).length;
  const incomeCount = templates.filter((t) => t.enabled && t.type === 'income').length;
  const expenseCount = templates.filter((t) => t.enabled && t.type === 'expense').length;

  const minColor = minimumPoint
    ? minimumPoint.balance < 0
      ? 'red'
      : minimumPoint.balance < 50000
        ? 'amber'
        : 'green'
    : 'green';

  const gradientMap = {
    red: { bg: 'rgba(239, 68, 68, 0.12)', border: 'rgba(239, 68, 68, 0.25)', glow: 'glow-red', orb: '#ef4444' },
    amber: { bg: 'rgba(245, 158, 11, 0.12)', border: 'rgba(245, 158, 11, 0.25)', glow: '', orb: '#f59e0b' },
    green: { bg: 'rgba(34, 197, 94, 0.12)', border: 'rgba(34, 197, 94, 0.25)', glow: 'glow-green', orb: '#22c55e' },
  };

  const minStyle = gradientMap[minColor];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0 }}
        >
          <BalanceDisplay balance={balance} onUpdate={onUpdateBalance} />
        </motion.div>
        {minimumPoint && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className={`relative overflow-hidden rounded-2xl p-6 ${minStyle.glow} card-hover`}
            style={{
              background: `linear-gradient(135deg, ${minStyle.bg} 0%, transparent 100%)`,
              border: `1px solid ${minStyle.border}`,
            }}
            whileHover={{ scale: 1.02 }}
          >
            <div
              className="absolute -top-10 -right-10 w-40 h-40 rounded-full opacity-15 blur-3xl"
              style={{ background: `radial-gradient(circle, ${minStyle.orb}, transparent)` }}
            />
            <p className="text-sm font-medium text-white/60 mb-1">最低残高</p>
            <p className="text-2xl font-bold text-white tabular-nums">
              ¥<CountUp end={minimumPoint.balance} duration={1} separator="," preserveValue />
            </p>
            <p className="text-xs text-white/40 mt-1">
              {new Date(minimumPoint.date).toLocaleDateString('ja-JP')}
            </p>
          </motion.div>
        )}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="relative overflow-hidden glass rounded-2xl p-6 card-hover"
          whileHover={{ scale: 1.02 }}
        >
          <div
            className="absolute -top-10 -right-10 w-40 h-40 rounded-full opacity-10 blur-3xl"
            style={{ background: 'radial-gradient(circle, #8b5cf6, transparent)' }}
          />
          <p className="text-slate-400 text-sm font-medium mb-1">有効なテンプレート</p>
          <p className="text-2xl font-bold text-white tabular-nums">
            <CountUp end={activeCount} duration={0.6} preserveValue />
          </p>
          <p className="text-xs text-slate-500 mt-1">
            収入 {incomeCount}件, 支出 {expenseCount}件
          </p>
        </motion.div>
      </div>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.3 }}
      >
        <ForecastChart data={forecast} minimumPoint={minimumPoint} />
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.4 }}
      >
        <UpcomingEvents events={upcomingEvents} />
      </motion.div>
    </div>
  );
}

export default Dashboard;
