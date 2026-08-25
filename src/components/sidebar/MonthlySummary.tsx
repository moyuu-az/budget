import { useMemo } from 'react';
import { useTemplateStore } from '../../stores/useTemplateStore';
import { useMonthlyStore, resolveAmount } from '../../stores/useMonthlyStore';
import { formatWithCommas } from '../../utils/currency';
import { toYearMonth } from '../../utils/forecast';
import { occursInMonth } from '../../../shared/recurrence';
import { LoadGate } from '../ui/LoadGate';
import { combineStatus } from '../../stores/load-status';
import { useMonthLoaded } from '../../hooks/useMonthLoaded';

function MonthlySummary() {
  const { templates } = useTemplateStore();
  const templatesStatus = useTemplateStore((s) => s.status);
  // A selector, not the whole store: this panel is mounted in both shells and
  // subscribing to everything re-renders both on any month's status changing.
  const monthlyAmountsMap = useMonthlyStore((s) => s.monthlyAmountsMap);

  const yearMonth = useMemo(() => toYearMonth(new Date()), []);

  // THIS PANEL FETCHES ITS OWN MONTH.
  //
  // It used to read `monthlyAmountsMap` and nothing else, which meant the map
  // was EMPTY until 収支管理 was opened -- so the sidebar, which is on screen on
  // every view, showed figures built from template defaults and then silently
  // changed the moment the user visited another screen. Two different answers
  // to 「今月の支出」 for the same month, with nothing to explain the jump.
  //
  // Through the shared hook rather than a local effect: it is what re-fetches
  // after a ledger switch (the status map is emptied and loadLedgerData does not
  // refetch months), and what deduplicates the two mounted copies of this panel.
  const { status: monthStatus, retry } = useMonthLoaded(yearMonth);

  // Ready only once the month's own figures have landed. Showing the defaults
  // in the meantime is the behaviour this fetch exists to end.
  const status = combineStatus(templatesStatus, monthStatus);

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
    // onRetry is NOT optional here, whatever the default suggests. LoadGate
    // falls back to loadLedgerData(), which deliberately skips per-month amounts
    // and actuals -- so the button would refetch everything except the thing
    // that failed and leave the same error on screen. LoadGate's own header
    // names this panel's data as exactly that case.
    return <LoadGate status={status} height={92} label="今月のサマリー" onRetry={retry} />;
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
