import { memo } from 'react';
import { motion } from 'framer-motion';
import type { ComparisonRow } from '../../types';
import { formatCurrency } from '../../utils/forecast';

interface ComparisonTableProps {
  data: ComparisonRow[];
  yearMonth: string;
}

function formatMonth(ym: string): string {
  const [y, m] = ym.split('-');
  return `${y}年${parseInt(m)}月`;
}

function DiffCell({ diff, percent }: { diff: number | null; percent: number | null }) {
  if (diff == null) {
    return <td className="px-3 py-2 text-center text-slate-500">-</td>;
  }

  const isIncrease = diff > 0;
  const isLargeChange = percent != null && Math.abs(percent) >= 20;

  // For expenses: increase = bad (red), decrease = good (green)
  const colorClass = isIncrease
    ? 'text-red-400'
    : diff < 0
      ? 'text-green-400'
      : 'text-slate-400';

  const bgClass = isLargeChange ? 'bg-amber-500/10' : '';

  return (
    <td className={`px-3 py-2 text-right text-sm ${bgClass}`}>
      <div className={colorClass}>
        <span>{isIncrease ? '+' : ''}{formatCurrency(diff)}</span>
        {percent != null && (
          <span className="text-xs ml-1 opacity-70">
            ({isIncrease ? '+' : ''}{percent}%)
          </span>
        )}
      </div>
    </td>
  );
}

function ComparisonTable({ data, yearMonth }: ComparisonTableProps) {
  if (data.length === 0) {
    return (
      <motion.div
        className="glass rounded-2xl p-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.3 }}
      >
        <h2 className="text-lg font-semibold text-white mb-4">
          月次比較 - {formatMonth(yearMonth)}
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
      transition={{ duration: 0.4, delay: 0.3 }}
    >
      <h2 className="text-lg font-semibold text-white mb-4">
        月次比較 - {formatMonth(yearMonth)}
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700/50">
              <th className="text-left px-3 py-2 text-slate-400 font-medium">カテゴリ</th>
              <th className="text-right px-3 py-2 text-slate-400 font-medium">当月</th>
              <th className="text-right px-3 py-2 text-slate-400 font-medium">前月比</th>
              <th className="text-right px-3 py-2 text-slate-400 font-medium">前年比</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.name} className="border-b border-slate-800/30 hover:bg-slate-800/20">
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: row.color }}
                    />
                    <span className="text-slate-200">{row.name}</span>
                  </div>
                </td>
                <td className="px-3 py-2 text-right text-white font-medium">
                  {formatCurrency(row.currentAmount)}
                </td>
                <DiffCell diff={row.prevMonthDiff} percent={row.prevMonthPercent} />
                <DiffCell diff={row.prevYearDiff} percent={row.prevYearPercent} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}

export default memo(ComparisonTable);
