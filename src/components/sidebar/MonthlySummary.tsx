import { useMemo } from 'react';
import { useTemplateStore } from '../../stores/useTemplateStore';
import { useMonthlyStore, resolveAmount } from '../../stores/useMonthlyStore';
import { formatWithCommas } from '../../utils/currency';
import { toYearMonth } from '../../utils/forecast';

function MonthlySummary() {
  const { templates } = useTemplateStore();
  const { monthlyAmountsMap } = useMonthlyStore();

  const yearMonth = useMemo(() => toYearMonth(new Date()), []);

  const { totalIncome, totalExpense, net } = useMemo(() => {
    const enabledTemplates = templates.filter((t) => t.enabled);
    let income = 0;
    let expense = 0;

    for (const template of enabledTemplates) {
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
