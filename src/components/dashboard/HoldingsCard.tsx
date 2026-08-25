import { memo, type ReactElement } from 'react';
import { motion } from 'framer-motion';
import { Card } from '../ui/Card';
import { Tabs } from '../ui/Tabs';
import { useAssetStore } from '../../stores/useAssetStore';
import { useUIStore } from '../../stores/useUIStore';
import { LoadGate } from './LoadGate';
import { summarizeHoldings } from '../../utils/net-worth';
import { formatYen } from '../../utils/currency';
import type { HoldingsView } from '../../types/ui';

const VIEWS: { value: HoldingsView; label: string }[] = [
  { value: 'cash', label: '現金' },
  { value: 'netWorth', label: '純資産' },
];

/**
 * What the household holds right now, as either cash or net worth.
 *
 * 現金 IS PART OF 純資産, NOT A SIBLING OF IT. The two views are a zoom level on
 * one list of holdings: 現金 shows the cash category alone, 純資産 shows every
 * category including it. Nothing here adds the two together -- see the note at
 * the top of utils/net-worth.ts for why that used to happen and what it cost.
 *
 * THE TOGGLE DELIBERATELY REACHES NOTHING ELSE ON THIS SCREEN. The forecast and
 * the minimum-balance warning stay cash whichever lens is selected: a NISA
 * position cannot pay next month's rent, and letting it lift the projected floor
 * would silence the one warning this app exists to raise. The invariant is
 * enforced structurally -- the forecast comes from useForecast(), which reads
 * useCashBalance() and cannot see this state at all.
 */
function HoldingsCard(): ReactElement {
  const categories = useAssetStore((s) => s.categories);
  const assets = useAssetStore((s) => s.assets);
  const status = useAssetStore((s) => s.status);
  const view = useUIStore((s) => s.holdingsView);
  const setView = useUIStore((s) => s.setHoldingsView);

  // Through the same gate as everything else, rather than the older
  // `categories.length === 0` test. Both were true at the same moments -- every
  // ledger has a cash category, so a loaded list is never empty -- but two
  // notions of "has it arrived" is one more than can be kept in step, and this
  // one also distinguishes a failure from a wait.
  if (status !== 'ready') {
    return <LoadGate status={status} height={104} label="資産" children={null} />;
  }

  const holdings = summarizeHoldings(categories, assets);

  // Offered only when something other than cash actually HOLDS SOMETHING --
  // not merely when another category exists. An empty NISA category makes the
  // two views the same number, and a toggle between a figure and itself invites
  // the user to look for a difference that is not there. (It also renders a
  // 「＋ その他 ¥0」 line with no chip beside it, since summarizeHoldings drops
  // categories holding nothing.)
  const hasOtherAssets =
    holdings.byCategory.some((line) => !line.isCash) || holdings.unlisted !== 0;
  const showingNetWorth = hasOtherAssets && view === 'netWorth';

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
      <Card padding="md">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-[var(--color-content-muted)]">
              {showingNetWorth ? '純資産' : '現金'}
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-[var(--color-content-primary)]">
              {formatYen(showingNetWorth ? holdings.total : holdings.cash)}
            </p>
          </div>
          {hasOtherAssets && (
            <Tabs items={VIEWS} value={view} onChange={setView} ariaLabel="表示する資産の範囲" size="sm" />
          )}
        </div>

        {showingNetWorth ? (
          <>
            {/* The total is never shown without its parts. 現金 is called out
                separately because it is the only part the forecast can spend. */}
            <p className="mt-2 text-xs text-[var(--color-content-secondary)] tabular-nums">
              現金 {formatYen(holdings.cash)} ＋ その他 {formatYen(holdings.nonCash)}
            </p>
            <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
              {holdings.byCategory.map((line) => (
                <li key={line.id} className="flex items-center gap-2 text-xs">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: line.color ?? 'var(--color-content-muted)' }}
                  />
                  <span className="text-[var(--color-content-muted)]">{line.name}</span>
                  <span className="tabular-nums text-[var(--color-content-secondary)]">
                    {formatYen(line.value)}
                  </span>
                </li>
              ))}
              {/* Holdings whose category this client has not loaded. Normally
                  absent; shown rather than dropped so the chips always add up
                  to the total above them -- the same rule the total obeys. */}
              {holdings.unlisted !== 0 && (
                <li className="flex items-center gap-2 text-xs">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: 'var(--color-content-muted)' }}
                  />
                  <span className="text-[var(--color-content-muted)]">その他</span>
                  <span className="tabular-nums text-[var(--color-content-secondary)]">
                    {formatYen(holdings.unlisted)}
                  </span>
                </li>
              )}
            </ul>
          </>
        ) : (
          <p className="mt-2 text-xs text-[var(--color-content-secondary)]">
            資産の「現金」の合計です。残高予測はこの金額から始まります。
          </p>
        )}
      </Card>
    </motion.div>
  );
}

export default memo(HoldingsCard);
