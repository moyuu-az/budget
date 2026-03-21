import { memo, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import type { BalanceSnapshot, ForecastPoint } from '../../types';
import { formatYAxisTick, formatCurrency } from '../../utils/forecast';

interface TimelineChartProps {
  snapshots: BalanceSnapshot[];
  forecast: ForecastPoint[];
}

interface TimelineDataPoint {
  date: string;
  label: string;
  pastBalance?: number;
  futureBalance?: number;
}

const tooltipStyle = {
  background: 'rgba(30, 41, 72, 0.9)',
  backdropFilter: 'blur(12px)',
  border: '1px solid rgba(100, 116, 170, 0.2)',
  borderRadius: '8px',
  padding: '8px 12px',
  color: '#e2e8f0',
  fontSize: '13px',
};

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}/${d.getMonth() + 1}`;
}

function formatTooltipDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

function TimelineChart({ snapshots, forecast }: TimelineChartProps) {
  const todayStr = useMemo(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }, []);

  const data = useMemo<TimelineDataPoint[]>(() => {
    const map = new Map<string, TimelineDataPoint>();

    // Add snapshots as past data
    const sorted = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
    for (const s of sorted) {
      map.set(s.date, {
        date: s.date,
        label: formatDateLabel(s.date),
        pastBalance: s.balance,
      });
    }

    // Add forecast as future data
    for (const f of forecast) {
      const existing = map.get(f.date);
      if (f.isToday) {
        // Bridge point: both past and future
        if (existing) {
          existing.futureBalance = f.balance;
        } else {
          map.set(f.date, {
            date: f.date,
            label: formatDateLabel(f.date),
            pastBalance: f.balance,
            futureBalance: f.balance,
          });
        }
      } else if (f.date > todayStr) {
        if (existing) {
          existing.futureBalance = f.balance;
        } else {
          map.set(f.date, {
            date: f.date,
            label: formatDateLabel(f.date),
            futureBalance: f.balance,
          });
        }
      }
    }

    // If we have snapshots but no today bridge, connect the last snapshot to forecast
    if (sorted.length > 0 && forecast.length > 0) {
      const todayPoint = map.get(todayStr);
      if (!todayPoint) {
        const todayForecast = forecast.find((f) => f.isToday);
        if (todayForecast) {
          map.set(todayStr, {
            date: todayStr,
            label: formatDateLabel(todayStr),
            pastBalance: todayForecast.balance,
            futureBalance: todayForecast.balance,
          });
        }
      }
    }

    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [snapshots, forecast, todayStr]);

  if (data.length === 0) {
    return (
      <motion.div
        className="glass rounded-2xl p-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <h2 className="text-lg font-semibold text-white mb-4">残高タイムライン</h2>
        <div className="flex items-center justify-center h-48 text-slate-400">
          データがありません。履歴からスナップショットを追加してください。
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="glass rounded-2xl p-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">残高タイムライン</h2>
        <div className="flex items-center gap-4 text-xs text-slate-400">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-green-500 inline-block rounded" />
            実績
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-blue-500 inline-block rounded border-dashed" style={{ borderTop: '2px dashed #3b82f6', height: 0 }} />
            予測
          </span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
          <defs>
            <linearGradient id="pastGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(100, 116, 170, 0.15)" />
          <XAxis
            dataKey="date"
            tickFormatter={formatDateLabel}
            stroke="#64748b"
            tick={{ fontSize: 11 }}
            interval="preserveStartEnd"
          />
          <YAxis
            tickFormatter={formatYAxisTick}
            stroke="#64748b"
            tick={{ fontSize: 11 }}
            width={50}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            labelFormatter={formatTooltipDate}
            formatter={(value: number, name: string) => [
              formatCurrency(value),
              name === 'pastBalance' ? '実績' : '予測',
            ]}
          />
          <ReferenceLine
            x={todayStr}
            stroke="#f59e0b"
            strokeDasharray="4 4"
            label={{ value: '今日', position: 'top', fill: '#f59e0b', fontSize: 11 }}
          />
          <Area
            type="monotone"
            dataKey="pastBalance"
            stroke="#22c55e"
            fill="url(#pastGradient)"
            strokeWidth={2}
            dot={false}
            connectNulls
          />
          <Line
            type="stepAfter"
            dataKey="futureBalance"
            stroke="#3b82f6"
            strokeDasharray="6 3"
            strokeWidth={2}
            dot={false}
            connectNulls
          />
        </ComposedChart>
      </ResponsiveContainer>
    </motion.div>
  );
}

export default memo(TimelineChart);
