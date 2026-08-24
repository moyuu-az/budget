import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTemplateStore } from '../../stores/useTemplateStore';
import { useMonthlyStore, resolveAmount } from '../../stores/useMonthlyStore';
import EntryRow from './EntryRow';
import { costTypeLabel } from '../../utils/cost-type';
import type { Category, EntryTemplate } from '../../types';

interface Props {
  category: Category | null;
  templates: EntryTemplate[];
  yearMonth: string;
}

function CategoryGroup({ category, templates, yearMonth }: Props) {
  const [collapsed, setCollapsed] = useState(false);

  const allTemplates = useTemplateStore((s) => s.templates);
  const monthlyAmountsMap = useMonthlyStore((s) => s.monthlyAmountsMap);

  // Calculate subtotal for enabled templates
  const subtotal = templates
    .filter((t) => t.enabled)
    .reduce((sum, t) => sum + resolveAmount(t.id, yearMonth, monthlyAmountsMap, allTemplates), 0);

  const sortedTemplates = useMemo(
    () => [...templates].sort((a, b) => a.dayOfMonth - b.dayOfMonth || a.sortOrder - b.sortOrder),
    [templates]
  );

  if (templates.length === 0) return null;

  return (
    <div className="mb-3">
      {/* Category header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center justify-between w-full px-3 py-2 rounded-lg hover:bg-slate-700/30 transition-colors group"
      >
        <div className="flex items-center gap-2">
          {/* Collapse indicator */}
          <svg
            className={`w-3.5 h-3.5 text-slate-500 transition-transform ${collapsed ? '' : 'rotate-90'}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>

          {/* Color dot */}
          {category?.color ? (
            <span
              className="w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: category.color }}
            />
          ) : (
            <span className="w-3 h-3 rounded-full shrink-0 bg-slate-600" />
          )}

          {/* Category name */}
          <span className="text-sm font-medium text-slate-300">
            {category?.name ?? '未分類'}
          </span>
          <span className="text-xs text-slate-500">({templates.length})</span>

          {/* 固定費/変動費 of the group, so the split in the summary above can be
              traced back to the rows that produced it. */}
          {category?.type === 'expense' && (
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                category.costType === 'fixed'
                  ? 'bg-blue-500/15 text-blue-300'
                  : category.costType === 'variable'
                    ? 'bg-violet-500/15 text-violet-300'
                    : 'bg-slate-600/30 text-slate-400'
              }`}
            >
              {costTypeLabel(category.costType)}
            </span>
          )}
        </div>

        {/* Subtotal */}
        <span className="text-sm tabular-nums text-slate-400">
          ¥{subtotal.toLocaleString()}
        </span>
      </button>

      {/* Template rows */}
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="ml-2 border-l border-slate-700/50 pl-1">
              {sortedTemplates.map((t) => (
                  <EntryRow key={t.id} template={t} yearMonth={yearMonth} />
                ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default CategoryGroup;
