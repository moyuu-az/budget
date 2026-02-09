import type { EntryTemplate } from '../types';
import MonthlyAmountRow from './MonthlyAmountRow';

interface MonthlyAmountsListProps {
  templates: EntryTemplate[];
  amountsForMonth: Map<number, number> | undefined;
  onAmountChange: (templateId: number, amount: number) => void;
  onToggle: (id: number, enabled: boolean) => void;
}

function MonthlyAmountsList({ templates, amountsForMonth, onAmountChange, onToggle }: MonthlyAmountsListProps) {
  const incomeTemplates = templates.filter((t) => t.type === 'income');
  const expenseTemplates = templates.filter((t) => t.type === 'expense');

  if (templates.length === 0) {
    return (
      <p className="text-slate-500 text-sm py-8 text-center">
        No templates yet. Use "Manage Templates" to add one.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {incomeTemplates.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-green-400 uppercase tracking-wider mb-2">Income</h3>
          <div className="space-y-2">
            {incomeTemplates.map((t) => (
              <MonthlyAmountRow
                key={t.id}
                template={t}
                amount={amountsForMonth?.get(t.id)}
                onAmountChange={onAmountChange}
                onToggle={onToggle}
              />
            ))}
          </div>
        </div>
      )}
      {expenseTemplates.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-2">Expenses</h3>
          <div className="space-y-2">
            {expenseTemplates.map((t) => (
              <MonthlyAmountRow
                key={t.id}
                template={t}
                amount={amountsForMonth?.get(t.id)}
                onAmountChange={onAmountChange}
                onToggle={onToggle}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default MonthlyAmountsList;
