import { useMemo } from 'react';
import { motion } from 'framer-motion';
import CategoryGroup from './CategoryGroup';
import type { Category, EntryTemplate } from '../../types';

interface CategoryGroupData {
  category: Category;
  templates: EntryTemplate[];
}

interface CategoryGroupListProps {
  templates: EntryTemplate[];
  categories: Category[];
  yearMonth: string;
}

function CategoryGroupList({ templates, categories, yearMonth }: CategoryGroupListProps) {
  // Group templates by category
  const { incomeGroups, expenseGroups, uncategorizedIncome, uncategorizedExpense } = useMemo(() => {
    const incomeCategories = categories.filter((c) => c.type === 'income').sort((a, b) => a.sortOrder - b.sortOrder);
    const expenseCategories = categories.filter((c) => c.type === 'expense').sort((a, b) => a.sortOrder - b.sortOrder);

    const incomeGroups: CategoryGroupData[] = incomeCategories.map((cat) => ({
      category: cat,
      templates: templates.filter((t) => t.type === 'income' && t.categoryId === cat.id),
    }));

    const expenseGroups: CategoryGroupData[] = expenseCategories.map((cat) => ({
      category: cat,
      templates: templates.filter((t) => t.type === 'expense' && t.categoryId === cat.id),
    }));

    const uncategorizedIncome = templates.filter((t) => t.type === 'income' && t.categoryId === null);
    const uncategorizedExpense = templates.filter((t) => t.type === 'expense' && t.categoryId === null);

    return { incomeGroups, expenseGroups, uncategorizedIncome, uncategorizedExpense };
  }, [templates, categories]);

  const hasIncomeContent = incomeGroups.some((g) => g.templates.length > 0) || uncategorizedIncome.length > 0;
  const hasExpenseContent = expenseGroups.some((g) => g.templates.length > 0) || uncategorizedExpense.length > 0;

  return (
    <>
      {/* Column headers -- WIDE SCREENS ONLY.
          
          On a phone each row wraps to two lines, so the amounts sit under the
          name rather than in columns beside it. A header row above that lines
          up with nothing, and a header naming a column that is not there is
          worse than no header. Each cell carries its own label instead. */}
      <div className="hidden sm:flex items-center gap-3 px-3 text-xs text-slate-500">
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
                  yearMonth={yearMonth}
                />
              ) : null
            )}

            {uncategorizedIncome.length > 0 && (
              <CategoryGroup
                category={null}
                templates={uncategorizedIncome}
                yearMonth={yearMonth}
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
                  yearMonth={yearMonth}
                />
              ) : null
            )}

            {uncategorizedExpense.length > 0 && (
              <CategoryGroup
                category={null}
                templates={uncategorizedExpense}
                yearMonth={yearMonth}
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
    </>
  );
}

export default CategoryGroupList;
