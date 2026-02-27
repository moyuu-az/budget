import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import CountUp from 'react-countup';
import type { EntryTemplate, EntryTemplateInput, MonthlyAmountsMap } from '../types';
import { toYearMonth } from '../utils/forecast';
import MonthNavigator from './MonthNavigator';
import MonthlyAmountsList from './MonthlyAmountsList';
import TemplateManager from './TemplateManager';

interface EntriesManagerProps {
  templates: EntryTemplate[];
  monthlyAmountsMap: MonthlyAmountsMap;
  onAddTemplate: (template: EntryTemplateInput) => Promise<EntryTemplate>;
  onUpdateTemplate: (id: number, template: Partial<EntryTemplateInput>) => Promise<void>;
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
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="grid grid-cols-2 gap-4"
      >
        <motion.div
          className="relative overflow-hidden rounded-xl p-4"
          style={{
            background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.1) 0%, transparent 100%)',
            border: '1px solid rgba(34, 197, 94, 0.2)',
          }}
          whileHover={{ scale: 1.02 }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        >
          <div
            className="absolute -top-8 -right-8 w-32 h-32 rounded-full opacity-15 blur-3xl"
            style={{ background: 'radial-gradient(circle, #22c55e, transparent)' }}
          />
          <p className="text-green-400 text-xs font-medium">収入</p>
          <p className="text-xl font-bold text-green-300 tabular-nums">
            +¥<CountUp end={totalIncome} duration={0.6} separator="," preserveValue />
          </p>
        </motion.div>
        <motion.div
          className="relative overflow-hidden rounded-xl p-4"
          style={{
            background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.1) 0%, transparent 100%)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
          }}
          whileHover={{ scale: 1.02 }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        >
          <div
            className="absolute -top-8 -right-8 w-32 h-32 rounded-full opacity-15 blur-3xl"
            style={{ background: 'radial-gradient(circle, #ef4444, transparent)' }}
          />
          <p className="text-red-400 text-xs font-medium">支出</p>
          <p className="text-xl font-bold text-red-300 tabular-nums">
            -¥<CountUp end={totalExpense} duration={0.6} separator="," preserveValue />
          </p>
        </motion.div>
      </motion.div>

      <div className="flex items-center justify-between">
        <MonthNavigator yearMonth={selectedMonth} onChange={setSelectedMonth} />
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopyFromLastMonth}
            disabled={copying}
            className="px-3 py-2 rounded-lg text-sm transition-all disabled:opacity-50"
            style={{
              background: 'rgba(100, 116, 170, 0.12)',
              border: '1px solid rgba(100, 116, 170, 0.2)',
              color: '#94a3b8',
            }}
          >
            {copying ? 'コピー中...' : '先月からコピー'}
          </button>
          <button
            onClick={() => setShowTemplateManager(true)}
            className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors"
          >
            テンプレート管理
          </button>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
      >
        <MonthlyAmountsList
          templates={templates}
          amountsForMonth={amountsForMonth}
          onAmountChange={handleAmountChange}
          onToggle={onToggleTemplate}
        />
      </motion.div>

      <AnimatePresence>
        {showTemplateManager && (
          <TemplateManager
            templates={templates}
            onAdd={onAddTemplate}
            onUpdate={onUpdateTemplate}
            onDelete={onDeleteTemplate}
            onClose={() => setShowTemplateManager(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export default EntriesManager;
