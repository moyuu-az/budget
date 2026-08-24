import { memo, type ReactElement } from 'react';
import { motion } from 'framer-motion';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { useDashboardKpis } from '../../hooks/useDashboardKpis';
import { formatYen, formatSignedYen } from '../../utils/currency';

interface KpiCardProps {
  label: string;
  value: string;
  caption?: string;
  badge?: { tone: 'success' | 'danger' | 'warning' | 'neutral'; text: string };
  delay: number;
}

function KpiCard({ label, value, caption, badge, delay }: KpiCardProps): ReactElement {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
    >
      <Card padding="md" className="h-full">
        <div className="flex items-start justify-between gap-2">
          <span className="text-xs font-medium text-[var(--color-content-muted)]">{label}</span>
          {badge && <Badge tone={badge.tone}>{badge.text}</Badge>}
        </div>
        <p className="mt-2 text-2xl font-bold tabular-nums text-[var(--color-content-primary)]">
          {value}
        </p>
        {caption && (
          <p className="mt-1 text-xs text-[var(--color-content-secondary)]">{caption}</p>
        )}
      </Card>
    </motion.div>
  );
}

function KpiHero(): ReactElement {
  const { thisMonthNet, minBalance90d, minBalance90dDate, nextLargeExpense, forecastSlopePerDay } =
    useDashboardKpis();

  const minDateLabel = minBalance90dDate
    ? new Date(minBalance90dDate).toLocaleDateString('ja-JP')
    : undefined;

  const slopeMonthly = forecastSlopePerDay * 30;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <KpiCard
        label="今月の収支"
        value={formatSignedYen(thisMonthNet)}
        badge={{
          tone: thisMonthNet >= 0 ? 'success' : 'danger',
          text: thisMonthNet >= 0 ? '黒字' : '赤字',
        }}
        delay={0}
      />
      <KpiCard
        label="最小残高(90日)"
        value={formatYen(minBalance90d)}
        caption={minDateLabel ? `${minDateLabel} 時点` : undefined}
        badge={{
          tone: minBalance90d < 0 ? 'danger' : minBalance90d < 50000 ? 'warning' : 'success',
          text: minBalance90d < 0 ? '残高不足' : minBalance90d < 50000 ? '注意' : '安全',
        }}
        delay={0.05}
      />
      <KpiCard
        label="次の大型支出(60日)"
        value={nextLargeExpense ? formatYen(nextLargeExpense.amount) : '-'}
        caption={
          nextLargeExpense
            ? `${nextLargeExpense.name}・あと${nextLargeExpense.daysUntil}日`
            : '予定なし'
        }
        badge={nextLargeExpense ? { tone: 'danger', text: '支出' } : undefined}
        delay={0.1}
      />
      <KpiCard
        label="予測傾き"
        value={`${formatSignedYen(slopeMonthly)}/月`}
        caption={`1日あたり ${formatSignedYen(forecastSlopePerDay)}`}
        badge={{
          tone: forecastSlopePerDay >= 0 ? 'success' : 'danger',
          text: forecastSlopePerDay >= 0 ? '増加傾向' : '減少傾向',
        }}
        delay={0.15}
      />
    </div>
  );
}

export default memo(KpiHero);
