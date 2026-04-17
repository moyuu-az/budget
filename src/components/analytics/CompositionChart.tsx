import { memo, useMemo } from 'react';
import { motion } from 'framer-motion';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import type { CompositionItem } from '../../types';
import { formatCurrency } from '../../utils/forecast';

interface CompositionChartProps {
  data: CompositionItem[];
  yearMonth: string;
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
  return `${y}年${parseInt(m)}月`;
}

interface CenterLabelProps {
  cx: number;
  cy: number;
  total: number;
}

function CenterLabel({ cx, cy, total }: CenterLabelProps) {
  return (
    <g>
      <text x={cx} y={cy - 8} textAnchor="middle" fill="#94a3b8" fontSize={11}>
        合計
      </text>
      <text x={cx} y={cy + 14} textAnchor="middle" fill="#e2e8f0" fontSize={16} fontWeight="bold">
        {formatCurrency(total)}
      </text>
    </g>
  );
}

function CompositionChart({ data, yearMonth }: CompositionChartProps) {
  const total = useMemo(() => data.reduce((sum, d) => sum + d.amount, 0), [data]);

  if (data.length === 0) {
    return (
      <motion.div
        className="glass rounded-2xl p-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
      >
        <h2 className="text-lg font-semibold text-white mb-4">
          支出構成 - {formatMonth(yearMonth)}
        </h2>
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
      transition={{ duration: 0.4, delay: 0.2 }}
    >
      <h2 className="text-lg font-semibold text-white mb-4">
        支出構成 - {formatMonth(yearMonth)}
      </h2>
      <div className="flex items-center gap-4">
        <div className="w-1/2">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={85}
                paddingAngle={2}
                dataKey="amount"
                nameKey="name"
              >
                {data.map((item, idx) => (
                  <Cell key={`cell-${idx}`} fill={item.color} stroke="none" />
                ))}
              </Pie>
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value: number, name: string) => [formatCurrency(value), name]}
              />
              <CenterLabel cx={110} cy={110} total={total} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="w-1/2 space-y-2">
          {data.map((item) => (
            <div key={item.name} className="flex items-center gap-2 text-sm">
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: item.color }}
              />
              <span className="text-slate-300 truncate flex-1">{item.name}</span>
              <span className="text-white font-medium text-right whitespace-nowrap">
                {formatCurrency(item.amount)}
              </span>
              <span className="text-slate-500 text-xs w-12 text-right">
                {item.percentage}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

export default memo(CompositionChart);
