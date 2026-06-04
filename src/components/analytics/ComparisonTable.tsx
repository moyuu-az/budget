import { memo, useMemo, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import type { ComparisonRow } from '../../types';
import { formatCurrency } from '../../utils/forecast';
import { EmptyState } from '../ui/EmptyState';

interface ComparisonTableProps {
  data: ComparisonRow[];
  yearMonth: string;
}

type SortKey = 'name' | 'current' | 'prevMonth' | 'prevYear';
type SortDirection = 'asc' | 'desc';

function formatMonth(ym: string): string {
  const [y, m] = ym.split('-');
  return `${y}年${parseInt(m)}月`;
}

function sortValue(row: ComparisonRow, key: SortKey): string | number | null {
  switch (key) {
    case 'name':
      return row.name;
    case 'current':
      return row.currentAmount;
    case 'prevMonth':
      return row.prevMonthDiff;
    case 'prevYear':
      return row.prevYearDiff;
  }
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
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDirection>('asc');

  const toggleSort = useCallback((key: SortKey) => {
    setSortKey((prevKey) => {
      if (prevKey === key) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        return key;
      }
      setSortDir(key === 'name' ? 'asc' : 'desc');
      return key;
    });
  }, []);

  const sortedData = useMemo(() => {
    if (!sortKey) return data;
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...data].sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'string' && typeof bv === 'string') {
        return av.localeCompare(bv, 'ja') * dir;
      }
      return (Number(av) - Number(bv)) * dir;
    });
  }, [data, sortKey, sortDir]);

  const ariaSortFor = useCallback(
    (key: SortKey): 'ascending' | 'descending' | 'none' => {
      if (sortKey !== key) return 'none';
      return sortDir === 'asc' ? 'ascending' : 'descending';
    },
    [sortKey, sortDir],
  );

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
        <EmptyState title="データがありません" />
      </motion.div>
    );
  }

  const sortIndicator = (key: SortKey): string =>
    sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';

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
              <th
                aria-sort={ariaSortFor('name')}
                className="text-left px-3 py-2 text-slate-400 font-medium"
              >
                <button
                  type="button"
                  onClick={() => toggleSort('name')}
                  className="font-medium hover:text-slate-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] rounded-[var(--radius-sm)]"
                >
                  カテゴリ{sortIndicator('name')}
                </button>
              </th>
              <th
                aria-sort={ariaSortFor('current')}
                className="text-right px-3 py-2 text-slate-400 font-medium"
              >
                <button
                  type="button"
                  onClick={() => toggleSort('current')}
                  className="font-medium hover:text-slate-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] rounded-[var(--radius-sm)]"
                >
                  当月{sortIndicator('current')}
                </button>
              </th>
              <th
                aria-sort={ariaSortFor('prevMonth')}
                className="text-right px-3 py-2 text-slate-400 font-medium"
              >
                <button
                  type="button"
                  onClick={() => toggleSort('prevMonth')}
                  className="font-medium hover:text-slate-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] rounded-[var(--radius-sm)]"
                >
                  前月比{sortIndicator('prevMonth')}
                </button>
              </th>
              <th
                aria-sort={ariaSortFor('prevYear')}
                className="text-right px-3 py-2 text-slate-400 font-medium"
              >
                <button
                  type="button"
                  onClick={() => toggleSort('prevYear')}
                  className="font-medium hover:text-slate-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] rounded-[var(--radius-sm)]"
                >
                  前年比{sortIndicator('prevYear')}
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedData.map((row) => (
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
