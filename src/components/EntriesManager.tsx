import { useState, useEffect, useCallback } from 'react';
import type { EntryTemplate, EntryTemplateInput, MonthlyAmountsMap } from '../types';
import { toYearMonth } from '../utils/forecast';
import MonthNavigator from './MonthNavigator';
import MonthlyAmountsList from './MonthlyAmountsList';
import TemplateManager from './TemplateManager';

interface EntriesManagerProps {
  templates: EntryTemplate[];
  monthlyAmountsMap: MonthlyAmountsMap;
  onAddTemplate: (template: EntryTemplateInput) => Promise<EntryTemplate>;
  onUpdateTemplate: (id: number, template: EntryTemplateInput) => Promise<EntryTemplate>;
  onDeleteTemplate: (id: number) => Promise<void>;
  onToggleTemplate: (id: number, enabled: boolean) => Promise<void>;
  onSetMonthlyAmount: (templateId: number, yearMonth: string, amount: number) => Promise<unknown>;
  onCopyMonthlyAmounts: (fromMonth: string, toMonth: string) => Promise<unknown>;
  onLoadMonth: (yearMonth: string) => Promise<unknown>;
}

function EntriesManager({
  templates,
  monthlyAmountsMap,
  onAddTemplate,
  onUpdateTemplate,
  onDeleteTemplate,
  onToggleTemplate,
  onSetMonthlyAmount,
  onCopyMonthlyAmounts,
  onLoadMonth
}: EntriesManagerProps) {
  const [selectedMonth, setSelectedMonth] = useState(() => toYearMonth(new Date()));
  const [showTemplateManager, setShowTemplateManager] = useState(false);
  const [copying, setCopying] = useState(false);

  useEffect(() => {
    onLoadMonth(selectedMonth);
  }, [selectedMonth, onLoadMonth]);

  const amountsForMonth = monthlyAmountsMap.get(selectedMonth);

  const handleAmountChange = useCallback(async (templateId: number, amount: number) => {
    await onSetMonthlyAmount(templateId, selectedMonth, amount);
  }, [selectedMonth, onSetMonthlyAmount]);

  const handleCopyFromLastMonth = useCallback(async () => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const prevDate = new Date(year, month - 2, 1);
    const prevMonth = toYearMonth(prevDate);
    setCopying(true);
    await onCopyMonthlyAmounts(prevMonth, selectedMonth);
    setCopying(false);
  }, [selectedMonth, onCopyMonthlyAmounts]);

  const totalIncome = templates
    .filter((t) => t.type === 'income' && t.enabled)
    .reduce((sum, t) => sum + (amountsForMonth?.get(t.id) ?? 0), 0);

  const totalExpense = templates
    .filter((t) => t.type === 'expense' && t.enabled)
    .reduce((sum, t) => sum + (amountsForMonth?.get(t.id) ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-green-900/20 border border-green-800/30 rounded-xl p-4">
          <p className="text-green-400 text-xs font-medium">Income</p>
          <p className="text-xl font-bold text-green-300">+¥{totalIncome.toLocaleString()}</p>
        </div>
        <div className="bg-red-900/20 border border-red-800/30 rounded-xl p-4">
          <p className="text-red-400 text-xs font-medium">Expenses</p>
          <p className="text-xl font-bold text-red-300">-¥{totalExpense.toLocaleString()}</p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <MonthNavigator yearMonth={selectedMonth} onChange={setSelectedMonth} />
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopyFromLastMonth}
            disabled={copying}
            className="px-3 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-slate-300 text-sm rounded-lg transition-colors"
          >
            {copying ? 'Copying...' : 'Copy from Last Month'}
          </button>
          <button
            onClick={() => setShowTemplateManager(true)}
            className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors"
          >
            Manage Templates
          </button>
        </div>
      </div>

      <MonthlyAmountsList
        templates={templates}
        amountsForMonth={amountsForMonth}
        onAmountChange={handleAmountChange}
        onToggle={onToggleTemplate}
      />

      {showTemplateManager && (
        <TemplateManager
          templates={templates}
          onAdd={onAddTemplate}
          onUpdate={onUpdateTemplate}
          onDelete={onDeleteTemplate}
          onClose={() => setShowTemplateManager(false)}
        />
      )}
    </div>
  );
}

export default EntriesManager;
