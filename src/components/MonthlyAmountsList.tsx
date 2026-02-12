import { motion } from 'framer-motion';
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
        テンプレートがありません。「テンプレート管理」から追加してください。
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {incomeTemplates.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-green-400 uppercase tracking-wider mb-2">収入</h3>
          <div className="space-y-2">
            {incomeTemplates.map((t, index) => (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
              >
                <MonthlyAmountRow
                  template={t}
                  amount={amountsForMonth?.get(t.id)}
                  onAmountChange={onAmountChange}
                  onToggle={onToggle}
                />
              </motion.div>
            ))}
          </div>
        </div>
      )}
      {expenseTemplates.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-2">支出</h3>
          <div className="space-y-2">
            {expenseTemplates.map((t, index) => (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
              >
                <MonthlyAmountRow
                  template={t}
                  amount={amountsForMonth?.get(t.id)}
                  onAmountChange={onAmountChange}
                  onToggle={onToggle}
                />
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default MonthlyAmountsList;
