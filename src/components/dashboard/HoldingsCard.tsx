import { memo, type ReactElement } from 'react';
import { motion } from 'framer-motion';
import { Card } from '../ui/Card';
import { Tabs } from '../ui/Tabs';
import { useBalanceStore } from '../../stores/useBalanceStore';
import { useAssetStore } from '../../stores/useAssetStore';
import { useUIStore } from '../../stores/useUIStore';
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
 * NOT RENDERED AT ALL when no asset category exists. Asset tracking is optional,
 * and a household that never opted in would otherwise get a card offering a
 * choice between one number and the same number -- plus a 純資産 view reading
 * ¥0, which looks like a fault rather than an empty feature.
 *
 * The toggle deliberately reaches nothing else on this screen. The forecast and
 * the minimum-balance warning stay cash whichever lens is selected: a NISA
 * position cannot pay next month's rent, and letting it lift the projected floor
 * would silence the one warning this app exists to raise.
 */
function HoldingsCard(): ReactElement | null {
  const balance = useBalanceStore((s) => s.balance);
  const categories = useAssetStore((s) => s.categories);
  const assets = useAssetStore((s) => s.assets);
  const view = useUIStore((s) => s.holdingsView);
  const setView = useUIStore((s) => s.setHoldingsView);

  if (categories.length === 0) return null;

  const holdings = summarizeHoldings(balance, categories, assets);
  const showingNetWorth = view === 'netWorth';

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
          <Tabs items={VIEWS} value={view} onChange={setView} ariaLabel="表示する資産の範囲" size="sm" />
        </div>

        {showingNetWorth ? (
          <>
            {/* The sum is never shown without its parts. If the account balance
                has also been entered as an asset, it is double counted -- and
                this line is where that becomes visible. */}
            <p className="mt-2 text-xs text-[var(--color-content-secondary)] tabular-nums">
              残高 {formatYen(holdings.cash)} ＋ 資産 {formatYen(holdings.assets)}
            </p>
            {(holdings.byCategory.length > 0 || holdings.other !== 0) && (
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
                    to 資産 above them -- the same rule the total obeys. */}
                {holdings.other !== 0 && (
                  <li className="flex items-center gap-2 text-xs">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: 'var(--color-content-muted)' }}
                    />
                    <span className="text-[var(--color-content-muted)]">その他</span>
                    <span className="tabular-nums text-[var(--color-content-secondary)]">
                      {formatYen(holdings.other)}
                    </span>
                  </li>
                )}
              </ul>
            )}
          </>
        ) : (
          <p className="mt-2 text-xs text-[var(--color-content-secondary)]">
            残高予測の起点となる口座残高です。
          </p>
        )}
      </Card>
    </motion.div>
  );
}

export default memo(HoldingsCard);
