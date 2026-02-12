import { motion } from 'framer-motion';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceDot
} from 'recharts';
import type { ForecastPoint } from '../types';
import { formatYAxisTick } from '../utils/forecast';

interface ForecastChartProps {
  data: ForecastPoint[];
  minimumPoint: ForecastPoint | null;
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: ForecastPoint }> }) {
  if (!active || !payload || !payload[0]) return null;
  const point = payload[0].payload;
  const date = new Date(point.date);
  const label = `${date.getMonth() + 1}/${date.getDate()}`;

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
      <p className="text-slate-400 text-xs mb-1">{label}</p>
      <p className="text-white font-bold text-lg">¥{point.balance.toLocaleString()}</p>
      {point.events.length > 0 && (
        <div className="mt-2 border-t border-white/10 pt-2">
          {point.events.map((e, i) => (
            <p key={i} className="text-xs text-blue-300">{e}</p>
          ))}
        </div>
      )}
    </div>
  );
}

function ForecastChart({ data, minimumPoint }: ForecastChartProps) {
  const formatXAxis = (dateStr: string) => {
    const date = new Date(dateStr);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };

  const minBalance = Math.min(...data.map((d) => d.balance));
  const maxBalance = Math.max(...data.map((d) => d.balance));
  const padding = (maxBalance - minBalance) * 0.1 || 10000;

  const dotColor = minimumPoint
    ? minimumPoint.balance < 0
      ? '#ef4444'
      : minimumPoint.balance < 50000
        ? '#f59e0b'
        : '#22c55e'
    : '#22c55e';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      className="glass rounded-2xl p-6"
    >
      <h2 className="text-lg font-semibold text-white mb-4">60日間予測</h2>
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
          <defs>
            <linearGradient id="forecastGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.25} />
              <stop offset="50%" stopColor="#8b5cf6" stopOpacity={0.1} />
              <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="forecastStroke" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#3b82f6" />
              <stop offset="100%" stopColor="#8b5cf6" />
            </linearGradient>
            <filter id="glow">
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
            interval={6}
            axisLine={{ stroke: 'rgba(100, 116, 170, 0.12)' }}
            tickLine={false}
          />
          <YAxis
            tickFormatter={formatYAxisTick}
            stroke="#4a5580"
            tick={{ fontSize: 11, fill: '#64748b' }}
            domain={[minBalance - padding, maxBalance + padding]}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="stepAfter"
            dataKey="balance"
            stroke="url(#forecastStroke)"
            strokeWidth={2.5}
            fill="url(#forecastGradient)"
            dot={false}
            activeDot={{
              r: 5,
              fill: '#3b82f6',
              stroke: 'rgba(59, 130, 246, 0.3)',
              strokeWidth: 8,
              filter: 'url(#glow)',
            }}
          />
          {minimumPoint && (
            <ReferenceDot
              x={minimumPoint.date}
              y={minimumPoint.balance}
              r={6}
              fill={dotColor}
              stroke="white"
              strokeWidth={2}
              filter="url(#glow)"
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
      {minimumPoint && (
        <motion.div
          className="mt-3 flex items-center gap-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          <span
            className="w-3 h-3 rounded-full chart-glow"
            style={{ backgroundColor: dotColor }}
          />
          <span className="text-sm text-slate-400">
            最低残高: ¥{minimumPoint.balance.toLocaleString()} ({new Date(minimumPoint.date).toLocaleDateString('ja-JP')})
          </span>
        </motion.div>
      )}
    </motion.div>
  );
}

export default ForecastChart;
