import { memo, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import type { CategoryTrendPoint } from '../../types';
import { formatYAxisTick, formatCurrency } from '../../utils/forecast';

interface CategoryTrendChartProps {
  data: CategoryTrendPoint[];
  todayYearMonth: string;
  type: 'expense' | 'income';
  onMonthClick?: (yearMonth: string) => void;
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

function formatMonth(ym: string): string {
  const [y, m] = ym.split('-');
  return `${y}/${parseInt(m)}`;
}

interface CustomTooltipProps {
  active?: boolean;
  label?: string;
  payload?: Array<{
    dataKey: string;
    value: number;
    color: string;
    name: string;
  }>;
}

function CustomTooltip({ active, label, payload }: CustomTooltipProps) {
  if (!active || !payload || !label) return null;

  const items = payload.filter((p) => p.value > 0);
  if (items.length === 0) return null;

  return (
    <div style={tooltipStyle}>
      <p className="text-slate-300 text-xs mb-1">{formatMonth(label)}</p>
      {items.map((item) => (
        <div key={item.dataKey} className="flex items-center gap-2 text-xs">
          <span
            className="w-2 h-2 rounded-full inline-block flex-shrink-0"
            style={{ backgroundColor: item.color }}
          />
          <span className="text-slate-300">{item.name}</span>
          <span className="text-white font-medium ml-auto">{formatCurrency(item.value)}</span>
        </div>
      ))}
    </div>
  );
}

function CategoryTrendChart({ data, todayYearMonth, type, onMonthClick }: CategoryTrendChartProps) {
  const title = type === 'expense' ? '支出トレンド' : '収入トレンド';

  // Collect all unique category names across all months
  const allCategories = useMemo(() => {
    const catMap = new Map<string, string>();
    for (const point of data) {
      for (const cat of point.categories) {
        const key = cat.categoryId != null ? String(cat.categoryId) : `null_${cat.name}`;
        if (!catMap.has(key)) {
          catMap.set(key, cat.color);
        }
      }
    }
    return catMap;
  }, [data]);

  // Transform data for Recharts: each month becomes { yearMonth, [categoryKey]: amount }
  const chartData = useMemo(() => {
    return data.map((point) => {
      const entry: Record<string, string | number> = { yearMonth: point.yearMonth };
      for (const cat of point.categories) {
        const key = cat.categoryId != null ? String(cat.categoryId) : `null_${cat.name}`;
        entry[key] = cat.amount;
      }
      return entry;
    });
  }, [data]);

  // Build bar definitions with name and color
  const barDefs = useMemo(() => {
    const defs: Array<{ key: string; name: string; color: string }> = [];
    const seen = new Set<string>();
    for (const point of data) {
      for (const cat of point.categories) {
        const key = cat.categoryId != null ? String(cat.categoryId) : `null_${cat.name}`;
        if (!seen.has(key)) {
          seen.add(key);
          defs.push({ key, name: cat.name, color: cat.color });
        }
      }
    }
    return defs;
  }, [data]);

  const handleClick = useCallback(
    (_data: unknown, index: number) => {
      if (onMonthClick && chartData[index]) {
        onMonthClick(chartData[index].yearMonth as string);
      }
    },
    [onMonthClick, chartData],
  );

  if (allCategories.size === 0) {
    return (
      <motion.div
        className="glass rounded-2xl p-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
      >
        <h2 className="text-lg font-semibold text-white mb-4">{title}</h2>
        <div className="flex items-center justify-center h-48 text-slate-400">
          データがありません
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="glass rounded-2xl p-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.1 }}
    >
      <h2 className="text-lg font-semibold text-white mb-4">{title}</h2>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart
          data={chartData}
          margin={{ top: 5, right: 20, bottom: 5, left: 10 }}
          onClick={(_e, state) => {
            if (state?.activeLabel && onMonthClick) {
              onMonthClick(state.activeLabel);
            }
          }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(100, 116, 170, 0.15)" />
          <XAxis
            dataKey="yearMonth"
            tickFormatter={formatMonth}
            stroke="#64748b"
            tick={{ fontSize: 11 }}
          />
          <YAxis
            tickFormatter={formatYAxisTick}
            stroke="#64748b"
            tick={{ fontSize: 11 }}
            width={50}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(100, 116, 170, 0.1)' }} />
          <ReferenceLine
            x={todayYearMonth}
            stroke="#f59e0b"
            strokeDasharray="4 4"
          />
          {barDefs.map((def) => (
            <Bar
              key={def.key}
              dataKey={def.key}
              stackId="stack"
              fill={def.color}
              name={def.name}
              radius={[0, 0, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </motion.div>
  );
}

export default memo(CategoryTrendChart);
