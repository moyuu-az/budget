import {
  LineChart,
  Line,
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
    <div className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 shadow-xl">
      <p className="text-slate-300 text-xs mb-1">{label}</p>
      <p className="text-white font-bold">¥{point.balance.toLocaleString()}</p>
      {point.events.length > 0 && (
        <div className="mt-1 border-t border-slate-700 pt-1">
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
    <div className="bg-slate-900 rounded-2xl p-6 border border-slate-800">
      <h2 className="text-lg font-semibold text-white mb-4">60-Day Forecast</h2>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis
            dataKey="date"
            tickFormatter={formatXAxis}
            stroke="#64748b"
            tick={{ fontSize: 11 }}
            interval={6}
          />
          <YAxis
            tickFormatter={formatYAxisTick}
            stroke="#64748b"
            tick={{ fontSize: 11 }}
            domain={[minBalance - padding, maxBalance + padding]}
          />
          <Tooltip content={<CustomTooltip />} />
          <Line
            type="stepAfter"
            dataKey="balance"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: '#3b82f6' }}
          />
          {minimumPoint && (
            <ReferenceDot
              x={minimumPoint.date}
              y={minimumPoint.balance}
              r={6}
              fill={dotColor}
              stroke="white"
              strokeWidth={2}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
      {minimumPoint && (
        <div className="mt-3 flex items-center gap-2">
          <span
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: dotColor }}
          />
          <span className="text-sm text-slate-400">
            Minimum: ¥{minimumPoint.balance.toLocaleString()} on{' '}
            {new Date(minimumPoint.date).toLocaleDateString('ja-JP')}
          </span>
        </div>
      )}
    </div>
  );
}

export default ForecastChart;
