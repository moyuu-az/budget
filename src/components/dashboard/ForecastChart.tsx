import { memo } from 'react';
import { motion } from 'framer-motion';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceDot,
  ReferenceLine,
} from 'recharts';
import type { ForecastPoint, ForecastPeriod } from '../../types';
import { formatYAxisTick, formatXAxis } from '../../utils/forecast';

interface ForecastChartProps {
  data: ForecastPoint[];
  minimumPoint: ForecastPoint | null;
  period: ForecastPeriod;
  onPeriodChange: (period: ForecastPeriod) => void;
  onOpenAnalytics?: () => void;
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
      <p className="text-slate-400 text-xs mb-1">
        {point.isToday ? `${label} - 今日（反映済み）` : label}
      </p>
      <p className="text-white font-bold text-lg">¥{point.balance.toLocaleString()}</p>
      {point.eventDetails.length > 0 && (
        <div className="mt-2 border-t border-white/10 pt-2 space-y-1">
          {point.eventDetails.map((detail, i) => (
            <div key={i} className="flex items-center justify-between gap-4">
              <span className="text-xs text-slate-300">{detail.name}</span>
              <span className={`text-xs font-medium tabular-nums ${detail.type === 'income' ? 'text-emerald-400' : 'text-red-400'}`}>
                {detail.type === 'income' ? '+' : '-'}¥{detail.amount.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const periodLabels: { value: ForecastPeriod; label: string }[] = [
  { value: '60d', label: '60日' },
  { value: '3m', label: '3ヶ月' },
  { value: '6m', label: '6ヶ月' },
  { value: '1y', label: '1年' },
];

function getXAxisInterval(period: ForecastPeriod): number {
  switch (period) {
    case '60d': return 6;
    case '3m': return 13;
    case '6m': return 29;
    case '1y': return 59;
  }
}

function ForecastChart({ data, minimumPoint, period, onPeriodChange, onOpenAnalytics }: ForecastChartProps) {
  const todayPoint = data.find((p) => p.isToday) ?? null;

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
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">残高予測</h2>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-800/50 rounded-lg p-1">
            {periodLabels.map((p) => (
              <button
                key={p.value}
                onClick={() => onPeriodChange(p.value)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  period === p.value
                    ? 'bg-blue-500/20 text-blue-400'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          {onOpenAnalytics && (
            <button
              onClick={onOpenAnalytics}
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors ml-2"
            >
              詳細分析 →
            </button>
          )}
        </div>
      </div>
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
            interval={getXAxisInterval(period)}
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
          {/* Today's vertical dashed line */}
          {todayPoint && (
            <ReferenceLine
              x={todayPoint.date}
              stroke="#3b82f6"
              strokeDasharray="4 4"
              strokeOpacity={0.5}
            />
          )}
          {/* Today's special marker - larger dot */}
          {todayPoint && (
            <ReferenceDot
              x={todayPoint.date}
              y={todayPoint.balance}
              r={8}
              fill="#3b82f6"
              stroke="white"
              strokeWidth={2}
              filter="url(#glow)"
            />
          )}
          {/* Minimum balance marker */}
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
      <div className="mt-3 flex items-center gap-4 flex-wrap">
        {todayPoint && (
          <motion.div
            className="flex items-center gap-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: '#3b82f6' }} />
            <span className="text-sm text-slate-400">今日</span>
          </motion.div>
        )}
        {minimumPoint && (
          <motion.div
            className="flex items-center gap-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
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
      </div>
    </motion.div>
  );
}

export default memo(ForecastChart);
