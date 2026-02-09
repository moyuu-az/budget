import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';
import type { BalanceSnapshot } from '../types';
import { formatYAxisTick } from '../utils/forecast';

interface HistoryChartProps {
  snapshots: BalanceSnapshot[];
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: BalanceSnapshot }> }) {
  if (!active || !payload || !payload[0]) return null;
  const point = payload[0].payload;

  return (
    <div className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 shadow-xl">
      <p className="text-slate-300 text-xs mb-1">{point.date}</p>
      <p className="text-white font-bold">¥{point.balance.toLocaleString()}</p>
    </div>
  );
}

function HistoryChart({ snapshots }: HistoryChartProps) {
  const sorted = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));

  if (sorted.length < 2) {
    return (
      <div className="bg-slate-900 rounded-2xl p-6 border border-slate-800">
        <h2 className="text-lg font-semibold text-white mb-4">Balance History</h2>
        <p className="text-slate-500 text-sm">Add at least 2 snapshots to see the chart</p>
      </div>
    );
  }

  const formatXAxis = (dateStr: string) => {
    const date = new Date(dateStr);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };

  return (
    <div className="bg-slate-900 rounded-2xl p-6 border border-slate-800">
      <h2 className="text-lg font-semibold text-white mb-4">Balance History</h2>
      <ResponsiveContainer width="100%" height={250}>
        <AreaChart data={sorted} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
          <defs>
            <linearGradient id="balanceGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis
            dataKey="date"
            tickFormatter={formatXAxis}
            stroke="#64748b"
            tick={{ fontSize: 11 }}
          />
          <YAxis
            tickFormatter={formatYAxisTick}
            stroke="#64748b"
            tick={{ fontSize: 11 }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="balance"
            stroke="#8b5cf6"
            strokeWidth={2}
            fill="url(#balanceGradient)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export default HistoryChart;
