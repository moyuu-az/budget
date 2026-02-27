import { motion } from 'framer-motion';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { BalanceSnapshot } from '../../types';
import { formatYAxisTick } from '../../utils/forecast';

interface HistoryChartProps {
  snapshots: BalanceSnapshot[];
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: BalanceSnapshot }>;
}) {
  if (!active || !payload || !payload[0]) return null;
  const point = payload[0].payload;

  return (
    <div
      className="rounded-xl px-4 py-3 shadow-2xl"
      style={{
        background: 'rgba(30, 41, 72, 0.9)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid rgba(100, 116, 170, 0.2)',
      }}
    >
      <p className="text-slate-400 text-xs mb-1">{point.date}</p>
      <p className="text-white font-bold text-lg">
        ¥{point.balance.toLocaleString()}
      </p>
    </div>
  );
}

function HistoryChart({ snapshots }: HistoryChartProps) {
  const sorted = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));

  const formatXAxis = (dateStr: string) => {
    const date = new Date(dateStr);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      className="glass rounded-2xl p-6"
    >
      <h2 className="text-lg font-semibold text-white mb-4">残高推移</h2>
      <ResponsiveContainer width="100%" height={250}>
        <AreaChart
          data={sorted}
          margin={{ top: 5, right: 20, bottom: 5, left: 10 }}
        >
          <defs>
            <linearGradient id="historyGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.3} />
              <stop offset="50%" stopColor="#a78bfa" stopOpacity={0.1} />
              <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="historyStroke" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#8b5cf6" />
              <stop offset="100%" stopColor="#a78bfa" />
            </linearGradient>
            <filter id="historyGlow">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(100, 116, 170, 0.08)"
            vertical={false}
          />
          <XAxis
            dataKey="date"
            tickFormatter={formatXAxis}
            stroke="#4a5580"
            tick={{ fontSize: 11, fill: '#64748b' }}
            axisLine={{ stroke: 'rgba(100, 116, 170, 0.12)' }}
            tickLine={false}
          />
          <YAxis
            tickFormatter={formatYAxisTick}
            stroke="#4a5580"
            tick={{ fontSize: 11, fill: '#64748b' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="balance"
            stroke="url(#historyStroke)"
            strokeWidth={2.5}
            fill="url(#historyGradient)"
            dot={{
              r: 3,
              fill: '#8b5cf6',
              stroke: 'rgba(139, 92, 246, 0.3)',
              strokeWidth: 4,
            }}
            activeDot={{
              r: 5,
              fill: '#a78bfa',
              stroke: 'rgba(167, 139, 250, 0.3)',
              strokeWidth: 8,
              filter: 'url(#historyGlow)',
            }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </motion.div>
  );
}

export default HistoryChart;
