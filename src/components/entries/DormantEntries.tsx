import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import TemplateEditor from './TemplateEditor';
import { describeRecurrence } from '../../../shared/recurrence';
import { formatWithCommas } from '../../utils/currency';
import type { EntryTemplate } from '../../types';

// ---------------------------------------------------------------------------
// The entries that exist but do not fall in the month on screen.
//
// WHY THEY ARE SHOWN AT ALL
//   Two reasons, and the second is the important one.
//
//   1. REACHABILITY. A yearly premium set for March would otherwise be editable
//      only during March. Someone correcting next year's amount in September has
//      nowhere to click, and the obvious workaround -- navigate eleven months --
//      is not obvious at all.
//
//   2. ACCOUNTABILITY OF THE TOTALS. 収支管理 states a 支出合計 for the month.
//      Entries excluded from it silently would make that figure unexplainable:
//      the household knows it pays 車検, does not see it, and cannot tell whether
//      the app forgot it or whether this simply is not its month. Listing them
//      here, outside the totals and labelled with when they DO occur, turns an
//      absence into an answer.
//
// COLLAPSED BY DEFAULT
//   In a typical month this is a handful of rows nobody needs. Expanded by
//   default it would push the entries that DO matter below the fold every time.
//
// NO AMOUNT EDITING HERE, DELIBERATELY
//   The rows show their default amount, not a per-month figure, and nothing here
//   writes one. A monthly override belongs to a month the entry occurs in;
//   offering to set one for a month it skips would store a value that never
//   resolves into anything, in a table (`monthly_amounts`) whose rows are
//   otherwise all live. The full editor is one click away and edits the entry
//   itself, which is what someone opening this section actually wants.
// ---------------------------------------------------------------------------

interface Props {
  templates: EntryTemplate[];
  /** The month being viewed. Shown so the heading can say which month is meant. */
  yearMonth: string;
}

function DormantEntries({ templates, yearMonth }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  // Enabled first, then by name: a disabled entry is doubly absent from the
  // month and belongs at the bottom of a list that is already about absence.
  const sorted = useMemo(
    () =>
      [...templates].sort(
        (a, b) => Number(b.enabled) - Number(a.enabled) || a.name.localeCompare(b.name, 'ja'),
      ),
    [templates],
  );

  if (templates.length === 0) return null;

  const month = Number(yearMonth.slice(5, 7));

  return (
    <div className="rounded-xl bg-slate-800/30 border border-slate-700/40 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex items-center justify-between w-full px-4 py-3 text-left hover:bg-slate-700/20 transition-colors"
      >
        <span className="flex items-center gap-2 text-sm text-slate-400">
          <svg
            className={`w-3.5 h-3.5 shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          {month}月には発生しない項目
        </span>
        <span className="text-xs text-slate-500 tabular-nums">{templates.length} 件</span>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <p className="px-4 pb-2 text-xs text-slate-500">
              上の合計には含まれていません。次に発生する時期は各行に表示しています。
            </p>
            <ul className="px-2 pb-2 space-y-1">
              {sorted.map((template) => (
                <li key={template.id}>
                  <div className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-slate-700/20 transition-colors">
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        template.type === 'income' ? 'bg-green-500/70' : 'bg-red-500/70'
                      }`}
                      aria-hidden="true"
                    />
                    <span
                      className={`flex-1 text-sm truncate ${
                        template.enabled ? 'text-slate-300' : 'text-slate-500 line-through'
                      }`}
                    >
                      {template.name}
                    </span>
                    <span className="text-xs text-slate-500 shrink-0">
                      {describeRecurrence(template.recurrence)}
                    </span>
                    <span className="w-24 text-right text-xs text-slate-500 tabular-nums shrink-0">
                      ¥{formatWithCommas(template.defaultAmount)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setEditingId(editingId === template.id ? null : template.id)}
                      aria-label={`${template.name}を編集`}
                      className="shrink-0 text-slate-500 hover:text-slate-300 transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                        />
                      </svg>
                    </button>
                  </div>

                  <AnimatePresence>
                    {editingId === template.id && (
                      <div className="px-2 pb-2">
                        <TemplateEditor
                          template={template}
                          onSave={() => setEditingId(null)}
                          onCancel={() => setEditingId(null)}
                        />
                      </div>
                    )}
                  </AnimatePresence>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default DormantEntries;
