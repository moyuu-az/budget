import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTemplateStore } from '../../stores/useTemplateStore';
import { useMonthlyStore, resolveAmount } from '../../stores/useMonthlyStore';
import { useCategoryStore } from '../../stores/useCategoryStore';
import { useToastStore } from '../../stores/useToastStore';
import { toYearMonth } from '../../utils/forecast';
import MonthNavigator from './MonthNavigator';
import CategoryGroup from './CategoryGroup';
import TemplateEditor from './TemplateEditor';
import ConfirmDialog from '../shared/ConfirmDialog';

function EntriesView() {
  const [currentYearMonth, setCurrentYearMonth] = useState(() => toYearMonth(new Date()));
  const [showNewTemplate, setShowNewTemplate] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [copying, setCopying] = useState(false);

  const templates = useTemplateStore((s) => s.templates);
  const categories = useCategoryStore((s) => s.categories);
  const monthlyAmountsMap = useMonthlyStore((s) => s.monthlyAmountsMap);
  const fetchMonthlyAmounts = useMonthlyStore((s) => s.fetchMonthlyAmounts);
  const fetchMonthlyActuals = useMonthlyStore((s) => s.fetchMonthlyActuals);
  const copyMonthlyAmounts = useMonthlyStore((s) => s.copyMonthlyAmounts);
  const deleteMonthlyAmount = useMonthlyStore((s) => s.deleteMonthlyAmount);
  const addToast = useToastStore((s) => s.addToast);

  // Fetch month-specific data when month changes
  // Base data (templates, categories) is fetched by App.tsx on mount
  useEffect(() => {
    fetchMonthlyAmounts(currentYearMonth);
    fetchMonthlyActuals(currentYearMonth);
  }, [currentYearMonth, fetchMonthlyAmounts, fetchMonthlyActuals]);

  // Group templates by category
  const { incomeGroups, expenseGroups, uncategorizedIncome, uncategorizedExpense } = useMemo(() => {
    const incomeCategories = categories.filter((c) => c.type === 'income').sort((a, b) => a.sortOrder - b.sortOrder);
    const expenseCategories = categories.filter((c) => c.type === 'expense').sort((a, b) => a.sortOrder - b.sortOrder);

    const incomeGroups = incomeCategories.map((cat) => ({
      category: cat,
      templates: templates.filter((t) => t.type === 'income' && t.categoryId === cat.id),
    }));

    const expenseGroups = expenseCategories.map((cat) => ({
      category: cat,
      templates: templates.filter((t) => t.type === 'expense' && t.categoryId === cat.id),
    }));

    const uncategorizedIncome = templates.filter((t) => t.type === 'income' && t.categoryId === null);
    const uncategorizedExpense = templates.filter((t) => t.type === 'expense' && t.categoryId === null);

    return { incomeGroups, expenseGroups, uncategorizedIncome, uncategorizedExpense };
  }, [templates, categories]);

  // Totals
  const totalIncome = useMemo(() => {
    return templates
      .filter((t) => t.type === 'income' && t.enabled)
      .reduce((sum, t) => sum + resolveAmount(t.id, currentYearMonth, monthlyAmountsMap, templates), 0);
  }, [templates, currentYearMonth, monthlyAmountsMap]);

  const totalExpense = useMemo(() => {
    return templates
      .filter((t) => t.type === 'expense' && t.enabled)
      .reduce((sum, t) => sum + resolveAmount(t.id, currentYearMonth, monthlyAmountsMap, templates), 0);
  }, [templates, currentYearMonth, monthlyAmountsMap]);

  // Copy from previous month
  const handleCopyFromLastMonth = useCallback(async () => {
    const [year, month] = currentYearMonth.split('-').map(Number);
    const prevDate = new Date(year, month - 2, 1);
    const prevMonth = toYearMonth(prevDate);
    setCopying(true);
    try {
      await copyMonthlyAmounts(prevMonth, currentYearMonth);
      addToast('先月の金額をコピーしました', 'success');
    } catch {
      addToast('コピーに失敗しました', 'error');
    } finally {
      setCopying(false);
    }
  }, [currentYearMonth, copyMonthlyAmounts, addToast]);

  // Reset to defaults
  const handleResetToDefaults = useCallback(async () => {
    setShowResetConfirm(false);
    const monthMap = monthlyAmountsMap.get(currentYearMonth);
    if (!monthMap || monthMap.size === 0) {
      addToast('リセットする月別金額はありません', 'info');
      return;
    }
    try {
      const promises = Array.from(monthMap.keys()).map((templateId) =>
        deleteMonthlyAmount(templateId, currentYearMonth)
      );
      await Promise.all(promises);
      addToast('デフォルト金額にリセットしました', 'success');
    } catch {
      addToast('リセットに失敗しました', 'error');
    }
  }, [currentYearMonth, monthlyAmountsMap, deleteMonthlyAmount, addToast]);

  const hasIncomeContent = incomeGroups.some((g) => g.templates.length > 0) || uncategorizedIncome.length > 0;
  const hasExpenseContent = expenseGroups.some((g) => g.templates.length > 0) || uncategorizedExpense.length > 0;

  return (
    <motion.div
      className="space-y-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      {/* Header with month navigator */}
      <MonthNavigator yearMonth={currentYearMonth} onChange={setCurrentYearMonth} />

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4">
        <div
          className="relative overflow-hidden rounded-xl p-4"
          style={{
            background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.1) 0%, transparent 100%)',
            border: '1px solid rgba(34, 197, 94, 0.2)',
          }}
        >
          <p className="text-green-400 text-xs font-medium">収入合計</p>
          <p className="text-xl font-bold text-green-300 tabular-nums">
            +¥{totalIncome.toLocaleString()}
          </p>
        </div>
        <div
          className="relative overflow-hidden rounded-xl p-4"
          style={{
            background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.1) 0%, transparent 100%)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
          }}
        >
          <p className="text-red-400 text-xs font-medium">支出合計</p>
          <p className="text-xl font-bold text-red-300 tabular-nums">
            -¥{totalExpense.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Action bar */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setShowNewTemplate(!showNewTemplate)}
          className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors flex items-center gap-1.5"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          テンプレート追加
        </button>
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
          onClick={() => setShowResetConfirm(true)}
          className="px-3 py-2 rounded-lg text-sm transition-all"
          style={{
            background: 'rgba(100, 116, 170, 0.12)',
            border: '1px solid rgba(100, 116, 170, 0.2)',
            color: '#94a3b8',
          }}
        >
          デフォルトにリセット
        </button>
      </div>

      {/* New template form */}
      <AnimatePresence>
        {showNewTemplate && (
          <TemplateEditor
            onSave={() => setShowNewTemplate(false)}
            onCancel={() => setShowNewTemplate(false)}
          />
        )}
      </AnimatePresence>

      {/* Column headers */}
      <div className="flex items-center gap-3 px-3 text-xs text-slate-500">
        <div className="w-8 shrink-0" /> {/* Toggle spacer */}
        <div className="flex-1">項目</div>
        <div className="w-28 text-right">予定額</div>
        <div className="w-28 text-right">実績</div>
        <div className="w-3.5 shrink-0" /> {/* Edit button spacer */}
      </div>

      {/* Income section */}
      {hasIncomeContent && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <div className="rounded-xl bg-slate-800/50 border border-slate-700/50 p-4">
            <h2 className="text-lg font-semibold text-green-400 mb-3 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m0-16l-4 4m4-4l4 4" />
              </svg>
              収入
            </h2>

            {incomeGroups.map((group) =>
              group.templates.length > 0 ? (
                <CategoryGroup
                  key={group.category.id}
                  category={group.category}
                  templates={group.templates}
                  yearMonth={currentYearMonth}
                />
              ) : null
            )}

            {uncategorizedIncome.length > 0 && (
              <CategoryGroup
                category={null}
                templates={uncategorizedIncome}
                yearMonth={currentYearMonth}
              />
            )}
          </div>
        </motion.div>
      )}

      {/* Expense section */}
      {hasExpenseContent && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
        >
          <div className="rounded-xl bg-slate-800/50 border border-slate-700/50 p-4">
            <h2 className="text-lg font-semibold text-red-400 mb-3 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 20V4m0 16l-4-4m4 4l4-4" />
              </svg>
              支出
            </h2>

            {expenseGroups.map((group) =>
              group.templates.length > 0 ? (
                <CategoryGroup
                  key={group.category.id}
                  category={group.category}
                  templates={group.templates}
                  yearMonth={currentYearMonth}
                />
              ) : null
            )}

            {uncategorizedExpense.length > 0 && (
              <CategoryGroup
                category={null}
                templates={uncategorizedExpense}
                yearMonth={currentYearMonth}
              />
            )}
          </div>
        </motion.div>
      )}

      {/* Empty state */}
      {!hasIncomeContent && !hasExpenseContent && (
        <motion.div
          className="text-center py-12"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <p className="text-slate-500 text-sm">テンプレートがありません</p>
          <p className="text-slate-600 text-xs mt-1">「テンプレート追加」ボタンから追加してください</p>
        </motion.div>
      )}

      {/* Reset confirm dialog */}
      <ConfirmDialog
        open={showResetConfirm}
        title="デフォルトにリセット"
        message="この月のすべての月別金額を削除し、デフォルト金額に戻します。よろしいですか？"
        confirmLabel="リセット"
        cancelLabel="キャンセル"
        danger
        onConfirm={handleResetToDefaults}
        onCancel={() => setShowResetConfirm(false)}
      />
    </motion.div>
  );
}

export default EntriesView;
