import { useMemo } from 'react';
import { useTemplateStore } from '../../stores/useTemplateStore';
import { useMonthlyStore, resolveAmount } from '../../stores/useMonthlyStore';
import { formatWithCommas } from '../../utils/currency';

function getCurrentYearMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function MonthlySummary() {
  const { templates } = useTemplateStore();
  const { monthlyAmountsMap } = useMonthlyStore();

  const yearMonth = getCurrentYearMonth();

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
      <p className="text-xs text-slate-500 mb-2">今月のサマリー</p>
      <div className="space-y-1.5">
        <div className="flex justify-between items-center">
          <span className="text-xs text-slate-400">収入</span>
          <span className="text-sm text-green-400 font-medium">
            +¥{formatWithCommas(totalIncome)}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-slate-400">支出</span>
          <span className="text-sm text-red-400 font-medium">
            -¥{formatWithCommas(totalExpense)}
          </span>
        </div>
        <div className="border-t border-slate-700/50 pt-1.5">
          <div className="flex justify-between items-center">
            <span className="text-xs text-slate-400">差引</span>
            <span
              className={`text-sm font-bold ${
                net >= 0 ? 'text-green-400' : 'text-red-400'
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
