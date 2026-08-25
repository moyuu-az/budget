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
import { Tabs, type TabItem } from '../ui/Tabs';
import { useMinBalanceThreshold } from '../../stores/useSettingsStore';
import { balanceTone } from '../../utils/runway';
import { formatYen } from '../../utils/currency';

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

const periodTabs: TabItem<ForecastPeriod>[] = [
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
  const minBalanceThreshold = useMinBalanceThreshold();

  // The floor is part of the range on purpose. A projection that never comes
  // near it would otherwise scale the y-axis so the line sits off-chart -- and a
  // threshold you cannot see is one you cannot check the line against, which is
  // the only reason to draw it.
  const minBalance = Math.min(...data.map((d) => d.balance), minBalanceThreshold);
  const maxBalance = Math.max(...data.map((d) => d.balance), minBalanceThreshold);
  const padding = (maxBalance - minBalance) * 0.1 || 10000;

  // The SAME judgement the KPI badge makes. It used to be a second copy of
  // `50000` here, so a ledger with a 300,000 floor saw 「注意」 in the KPI row
  // and a green dot on this chart directly below it -- two answers to one
  // question, on one screen.
  const DOT_COLOR = { danger: '#ef4444', warning: '#f59e0b', safe: '#22c55e' } as const;
  const dotColor = minimumPoint
    ? DOT_COLOR[balanceTone(minimumPoint.balance, minBalanceThreshold)]
    : DOT_COLOR.safe;

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
          <Tabs
            items={periodTabs}
            value={period}
            onChange={onPeriodChange}
            ariaLabel="予測期間"
            size="sm"
          />
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
          {/* THE HOUSEHOLD'S FLOOR, drawn.
              
              Everything the dashboard calls 安全/注意 is measured against this
              figure, and until it was drawn here the household had to hold it in
              their head while reading the line. With it, the question 「いつ
              割るのか」 is answered by looking rather than by arithmetic -- which
              is the whole reason a chart beats a table.
              
              Hidden at 0: a line along the axis is not a threshold, it is the
              axis, and drawing it would suggest a setting nobody made. */}
          {minBalanceThreshold > 0 && (
            <ReferenceLine
              y={minBalanceThreshold}
              stroke="var(--color-semantic-warning)"
              strokeDasharray="6 4"
              strokeOpacity={0.7}
              label={{
                value: `最低残高 ${formatYen(minBalanceThreshold)}`,
                position: 'insideTopLeft',
                fill: 'var(--color-semantic-warning)',
                fontSize: 11,
              }}
            />
          )}
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
