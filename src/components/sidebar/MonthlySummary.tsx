import { useMemo } from 'react';
import { useTemplateStore } from '../../stores/useTemplateStore';
import { useMonthlyStore, resolveAmount } from '../../stores/useMonthlyStore';
import { formatWithCommas } from '../../utils/currency';
import { toYearMonth } from '../../utils/forecast';
import { occursInMonth } from '../../../shared/recurrence';
import { LoadGate } from '../ui/LoadGate';

function MonthlySummary() {
  const { templates } = useTemplateStore();
  const status = useTemplateStore((s) => s.status);
  const { monthlyAmountsMap } = useMonthlyStore();

  const yearMonth = useMemo(() => toYearMonth(new Date()), []);

  const { totalIncome, totalExpense, net } = useMemo(() => {
    // Enabled AND occurring THIS month. `enabled` alone is not the same question
    // since migration 005: an annual premium is enabled all year and belongs to
    // one month, so summing every enabled entry would put 車検 in this panel
    // twelve times a year -- and this panel sits beside the balance on every
    // screen, so it would be the most-seen wrong number in the application.
    //
    // The same predicate the 収支管理 totals and the forecast run; see
    // shared/recurrence.ts for why there is exactly one.
    const monthTemplates = templates.filter(
      (t) => t.enabled && occursInMonth(t.recurrence, yearMonth),
    );
    let income = 0;
    let expense = 0;

    for (const template of monthTemplates) {
      // `templates` -- the FULL list -- is what resolveAmount reads: it resolves
      // by id and needs every id to be findable.
      const amount = resolveAmount(template.id, yearMonth, monthlyAmountsMap, templates);
      if (template.type === 'income') {
        income += amount;
      } else {
        expense += amount;
      }
    }

    return {
      totalIncome: income,
      totalExpense: expense,
      net: income - expense,
    };
  }, [templates, monthlyAmountsMap, yearMonth]);

  // The last place on a cold-loading screen that showed ¥0 as a figure. With no
  // templates yet the sums are 0, and 「収入 +¥0 / 支出 -¥0」 reads as a month
  // with nothing in it rather than as a panel still waiting.
  if (status !== 'ready') {
    return <LoadGate status={status} height={92} label="今月のサマリー" />;
  }

  return (
    <div>
      <p className="text-xs text-[var(--color-content-muted)] mb-2">今月のサマリー</p>
      <div className="space-y-1.5">
        <div className="flex justify-between items-center">
          <span className="text-xs text-[var(--color-content-muted)]">収入</span>
          <span className="text-sm text-[var(--color-semantic-success)] font-medium">
            +¥{formatWithCommas(totalIncome)}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-[var(--color-content-muted)]">支出</span>
          <span className="text-sm text-[var(--color-semantic-danger)] font-medium">
            -¥{formatWithCommas(totalExpense)}
          </span>
        </div>
        <div className="border-t border-[var(--color-border-subtle)] pt-1.5">
          <div className="flex justify-between items-center">
            <span className="text-xs text-[var(--color-content-muted)]">差引</span>
            <span
              className={`text-sm font-bold ${
                net >= 0 ? 'text-[var(--color-semantic-success)]' : 'text-[var(--color-semantic-danger)]'
              }`}
            >
              {net >= 0 ? '+' : ''}¥{formatWithCommas(Math.abs(net))}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default MonthlySummary;
