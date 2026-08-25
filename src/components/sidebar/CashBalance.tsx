import { type ReactElement } from 'react';
import { useAssetStore } from '../../stores/useAssetStore';
import { useCashBalance } from '../../hooks/useCashBalance';
import { findCashCategory } from '../../utils/net-worth';
import { formatYen } from '../../utils/currency';
import { Skeleton } from '../ui/Skeleton';

interface Props {
  /**
   * Opens 資産, where the figure is actually edited.
   *
   * Optional because not every host has a way to navigate; without it the card
   * is a plain readout rather than a dead-end button.
   */
  onEdit?: () => void;
}

/**
 * 現在の残高 -- read only, on purpose.
 *
 * WHY THERE IS NO INPUT HERE ANY MORE
 *   This used to be a text box writing a single `current_balance` setting. The
 *   balance is now the sum of the cash category's holdings, and a single box
 *   cannot express an edit to a sum: with 財布 and 銀行 recorded separately,
 *   typing 500,000 here has no answer to "which one changed?".
 *
 *   Guessing (write the difference into the first holding, say) would put money
 *   in a row the user did not choose. So the edit happens where the rows are, and
 *   this shows the total with a way to get there.
 *
 *   The breakdown line is what keeps that honest: it names how many holdings the
 *   figure came from, so a total that looks wrong points at where to look.
 */
function CashBalance({ onEdit }: Props): ReactElement {
  const balance = useCashBalance();
  const categories = useAssetStore((s) => s.categories);
  const assets = useAssetStore((s) => s.assets);
  const status = useAssetStore((s) => s.status);

  const cashCategory = findCashCategory(categories);
  const holdingCount = cashCategory
    ? assets.filter((asset) => asset.categoryId === cashCategory.id).length
    : 0;

  // Until the fetch lands the figure is ¥0 and the count is 0, which the caption
  // below would state as 「登録すると反映されます」 -- a confident claim that the
  // household has recorded no cash, made while its cash is still in flight.
  // Blank is the only honest thing to say here.
  const loaded = status === 'ready';

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        {/* A definition list rather than a label and a <p>: the pair really is a
            label and its value, which gives the figure a role a screen reader
            can find without depending on the layout around it. */}
        <dl className="min-w-0">
          <dt className="mb-1.5 text-xs text-[var(--color-content-muted)]">現在の残高</dt>
          <dd className="truncate text-2xl font-bold tabular-nums text-[var(--color-content-primary)]">
            {loaded ? formatYen(balance) : <Skeleton height={28} width={120} />}
          </dd>
        </dl>
        {loaded && onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="shrink-0 rounded-md px-2 py-1 text-xs text-[var(--color-content-secondary)] transition-colors hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-content-primary)]"
          >
            編集
          </button>
        )}
      </div>
      <p className="mt-1 text-xs text-[var(--color-content-muted)]">
        {!loaded
          ? '\u00a0'
          : holdingCount === 0
            ? '資産の「現金」に登録すると反映されます'
            : `資産の「${cashCategory?.name}」${holdingCount} 件の合計`}
      </p>
    </div>
  );
}

export default CashBalance;
