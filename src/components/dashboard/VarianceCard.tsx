import { type ReactElement } from 'react';
import { motion } from 'framer-motion';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { LoadGate } from '../ui/LoadGate';
import { useMonthlyVariance } from '../../hooks/useMonthlyVariance';
import { formatYen, formatSignedYen } from '../../utils/currency';

// ---------------------------------------------------------------------------
// 先月は計画どおりだったか。
//
// The comparison covers ONLY the entries with a recorded actual, and how many
// have NOT been recorded is stated beside it rather than folded in. That is the
// load-bearing decision, and it is worth being blunt about on screen too:
//
//   An entry the household has not got round to entering is not an entry they
//   spent ¥0 on. Counting its plan without its actual manufactures a surplus
//   that grows with how far behind they are on data entry -- the card would
//   congratulate them most loudly exactly when it knows least.
//
// So a reader can always tell 「予算どおり」 from 「まだ入力していない」, which
// are the same number and opposite meanings.
// ---------------------------------------------------------------------------

/** How many rows of the breakdown are worth the space. */
const VISIBLE_LINES = 3;

function VarianceCard(): ReactElement {
  const { variance, status, retry } = useMonthlyVariance();

  if (status !== 'ready') {
    return <LoadGate status={status} height={148} label="先月の予実" onRetry={retry} />;
  }

  const month = Number(variance.yearMonth.slice(5, 7));
  const overspent = variance.variance > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.1 }}
    >
      <Card padding="md" className="h-full">
        <div className="flex items-start justify-between gap-2">
          <span className="text-xs font-medium text-[var(--color-content-muted)]">
            {month}月の予定と実績
          </span>
          {/* No verdict without a comparison. `recordedCount` counts only the
              entries that HAVE a plan to compare against. */}
          {variance.recordedCount > 0 && (
            <Badge tone={overspent ? 'danger' : 'success'}>
              {overspent ? '超過' : '予算内'}
            </Badge>
          )}
        </div>

        {variance.recordedCount === 0 && variance.unplannedCount === 0 ? (
          // Not a failure and not an empty chart: a household that has not
          // recorded actuals has nothing to compare, and saying so is the whole
          // answer. Inventing a comparison from plans alone would report that
          // every month went exactly as planned.
          <p className="mt-3 text-sm text-[var(--color-content-secondary)]">
            {month}月の実績が記録されていません。
            <br />
            <span className="text-xs text-[var(--color-content-muted)]">
              収支管理の「実績」欄に入力すると、ここで予定と比べられます。
            </span>
          </p>
        ) : (
          <>
            {/* The headline appears only when something was actually COMPARED.
                A month whose every actual has no reconstructible plan has a real
                total and no verdict, and printing 「±¥0」 over it would read as
                「予算どおり」. */}
            {variance.recordedCount > 0 && (
              <>
                <p
                  data-testid="variance-total"
                  className="mt-2 text-2xl font-bold tabular-nums text-[var(--color-content-primary)]"
                >
                  {formatSignedYen(variance.variance)}
                </p>
                <p className="mt-1 text-xs text-[var(--color-content-secondary)]">
                  予定 {formatYen(variance.plannedTotal)} → 実績 {formatYen(variance.actualTotal)}
                </p>
              </>
            )}

            <ul className="mt-3 space-y-1">
              {variance.lines.slice(0, VISIBLE_LINES).map((line) => (
                <li key={line.templateId} className="flex items-center gap-2 text-xs">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: line.color ?? 'var(--color-content-muted)' }}
                    aria-hidden="true"
                  />
                  <span className="flex-1 truncate text-[var(--color-content-secondary)]">
                    {line.name}
                  </span>
                  <span
                    className={`tabular-nums ${
                      line.diff > 0
                        ? 'text-[var(--color-semantic-danger)]'
                        : line.diff < 0
                          ? 'text-[var(--color-semantic-success)]'
                          : 'text-[var(--color-content-muted)]'
                    }`}
                  >
                    {line.diff === 0 ? '±¥0' : formatSignedYen(line.diff)}
                  </span>
                </li>
              ))}
            </ul>

            {/* Stated, never folded into the totals. A surplus with twelve
                entries still unrecorded is telling a very different story from
                the same surplus with none, and only one of them is good news. */}
            {variance.missingCount > 0 && (
              <p className="mt-2 text-xs text-[var(--color-semantic-warning)]">
                未入力 {variance.missingCount} 件は比較に含まれていません
              </p>
            )}

            {/* Real money with no plan behind it. Reported, never compared: a
                schedule change deletes the per-month override with it, so what
                was budgeted then is not recorded anywhere -- and comparing
                against the entry's CURRENT default would invent a verdict. */}
            {variance.unplannedCount > 0 && (
              <p className="mt-2 text-xs text-[var(--color-content-muted)]">
                当時の予定額が不明な実績 {variance.unplannedCount} 件（
                {formatYen(variance.unplannedTotal)}）は比較に含まれていません
              </p>
            )}
          </>
        )}
      </Card>
    </motion.div>
  );
}

export default VarianceCard;
