import { memo, type ReactElement } from 'react';
import { motion } from 'framer-motion';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { LoadGate } from '../ui/LoadGate';
import { useDashboardKpis } from '../../hooks/useDashboardKpis';
import { formatYen } from '../../utils/currency';

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
  const {
    minBalance90d,
    minBalance90dDate,
    nextLargeExpense,
    safeToSpend,
    runway,
    minBalanceThreshold,
    status,
  } = useDashboardKpis();

  // Never the figures before the inputs arrive. Every KPI here is zero until the
  // balance lands, and 「最小残高 ¥0 / 残高不足」 in red is the false alarm this
  // whole mechanism exists to stop -- it appeared on every cold load, because
  // the balance takes one more round trip than the expenses it is compared
  // against.
  if (status !== 'ready') {
    return <LoadGate status={status} height={116} label="残高" />;
  }

  const minDateLabel = minBalance90dDate
    ? new Date(minBalance90dDate).toLocaleDateString('ja-JP')
    : undefined;

  // WHAT THIS ROW IS FOR, AND WHY TWO CARDS LEFT IT
  //
  // Four slots, and adding 使っていい額 and 残高がもつ期間 meant two had to go.
  // The two that went were the two that were not actionable HERE:
  //
  //   予測傾き (「¥-12,000/月」) is a fact about the projection rather than
  //   about the household, and nobody does anything differently because of it.
  //   The worry it was gesturing at -- "is this going down?" -- is answered
  //   better by 残高がもつ期間, in the form a household actually asks it.
  //
  //   今月の収支 is REDUNDANT: 今月のサマリー in the sidebar shows the same
  //   figure as 差引, on every screen including this one. Two cards showing one
  //   number is one card's worth of information taking two slots.
  //
  // What is left answers, in order: what may I spend, how long have I got, how
  // bad does it get, and what is the next big thing.
  const safeCaption = safeToSpend.until
    ? `${safeToSpend.until.names[0]}まであと${safeToSpend.until.daysUntil}日`
    : `今後${safeToSpend.horizonDays}日の予定を差し引いた額`;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <KpiCard
        label={safeToSpend.shortfall > 0 ? '不足額' : '使っていい額'}
        value={formatYen(safeToSpend.shortfall > 0 ? safeToSpend.shortfall : safeToSpend.amount)}
        caption={
          safeToSpend.shortfall > 0
            ? `最低残高 ${formatYen(minBalanceThreshold)} を下回ります`
            : safeCaption
        }
        badge={
          safeToSpend.shortfall > 0
            ? { tone: 'danger', text: '要対応' }
            : { tone: 'success', text: '余裕' }
        }
        delay={0}
      />
      <KpiCard
        label="残高がもつ期間"
        // Three states, not two.
        //
        //   null       -- not within the 90 days this KPI looks at. NOT "never":
        //                 saying 「割りません」 would be a claim the projection
        //                 cannot support.
        //   days === 0 -- ALREADY below the floor. 「あと0日」 reads as a
        //                 forecast about tomorrow; this is a fact about today,
        //                 and it has to say so or it contradicts the 不足額 card
        //                 sitting immediately to its left.
        //   otherwise  -- the day it crosses.
        value={runway === null ? '90日以上' : runway.days === 0 ? 'すでに下回っています' : `あと${runway.days}日`}
        caption={
          runway === null
            ? `最低残高 ${formatYen(minBalanceThreshold)} を90日以内には割りません`
            : runway.days === 0
              ? `最低残高 ${formatYen(minBalanceThreshold)} を現在すでに下回っています`
              : `${new Date(runway.date).toLocaleDateString('ja-JP')} に ${formatYen(minBalanceThreshold)} を割ります`
        }
        badge={
          runway === null
            ? { tone: 'success', text: '安全' }
            : runway.days === 0
              ? { tone: 'danger', text: '要対応' }
              : { tone: runway.days <= 14 ? 'danger' : 'warning', text: `${runway.days}日` }
        }
        delay={0.05}
      />
      <KpiCard
        label="最小残高(90日)"
        value={formatYen(minBalance90d)}
        caption={minDateLabel ? `${minDateLabel} 時点` : undefined}
        // Measured against the HOUSEHOLD's floor. This was `50000`, hard-coded,
        // which made 「安全」 mean the same thing for every household -- and
        // there was nothing on screen saying where the number came from.
        badge={{
          tone:
            minBalance90d < 0 ? 'danger' : minBalance90d < minBalanceThreshold ? 'warning' : 'success',
          text:
            minBalance90d < 0 ? '残高不足' : minBalance90d < minBalanceThreshold ? '注意' : '安全',
        }}
        delay={0.1}
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
        delay={0.15}
      />
    </div>
  );
}

export default memo(KpiHero);
