import type { ReactElement } from 'react';
import type { CostTypeBreakdown } from '../../utils/cost-type';
import { COST_TYPE_LABELS, UNCLASSIFIED_LABEL } from '../../utils/cost-type';

interface Props {
  breakdown: CostTypeBreakdown;
}

/**
 * How much of the month's expense is already committed.
 *
 * This is what the 固定費/変動費 classification is FOR. Without it the
 * classification is a label nobody reads; with it, a household can see at a
 * glance how much of the month is decided before anyone spends anything.
 *
 * 未分類 is shown rather than folded into 変動費: silently counting an
 * unclassified category as discretionary would make the figure look better than
 * it is, and the user would have no way to tell the difference.
 */
function CostTypeSummary({ breakdown }: Props): ReactElement | null {
  if (breakdown.total === 0) return null;

  const share = (value: number): number => Math.round((value / breakdown.total) * 100);

  const parts = [
    { key: 'fixed', label: COST_TYPE_LABELS.fixed, value: breakdown.fixed, color: 'rgb(96, 165, 250)' },
    { key: 'variable', label: COST_TYPE_LABELS.variable, value: breakdown.variable, color: 'rgb(167, 139, 250)' },
    { key: 'unclassified', label: UNCLASSIFIED_LABEL, value: breakdown.unclassified, color: 'rgb(100, 116, 139)' },
  ].filter((part) => part.value > 0);

  return (
    <div
      className="rounded-xl p-4"
      style={{ background: 'rgba(100, 116, 170, 0.06)', border: '1px solid var(--border-subtle)' }}
    >
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-medium text-slate-400">支出の内訳</p>
        <p className="text-xs text-slate-500">
          固定費率 {breakdown.total === 0 ? 0 : share(breakdown.fixed)}%
        </p>
      </div>

      {/* A single bar rather than three: the comparison being made is between
          the parts, and separate bars would each be scaled to themselves. */}
      <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-slate-700/40">
        {parts.map((part) => (
          <div
            key={part.key}
            style={{ width: `${(part.value / breakdown.total) * 100}%`, background: part.color }}
          />
        ))}
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-1">
        {parts.map((part) => (
          <li key={part.key} className="flex items-center gap-2 text-xs">
            <span className="h-2 w-2 rounded-full" style={{ background: part.color }} />
            <span className="text-slate-400">{part.label}</span>
            <span className="tabular-nums text-slate-300">¥{part.value.toLocaleString()}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default CostTypeSummary;
