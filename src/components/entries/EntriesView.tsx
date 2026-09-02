import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTemplateStore } from '../../stores/useTemplateStore';
import { useMonthlyStore, resolveAmount } from '../../stores/useMonthlyStore';
import { useCategoryStore } from '../../stores/useCategoryStore';
import { useToastStore } from '../../stores/useToastStore';
import { useMonthLoaded } from '../../hooks/useMonthLoaded';
import { useSearchParam } from '../../hooks/useRoute';
import { SEARCH_PARAMS, parseYearMonthParam } from '../../app/routes';
import { shiftYearMonth } from '../../types/ui';
import { toYearMonth } from '../../utils/forecast';
import { occursInMonth } from '../../../shared/recurrence';
import { summarizeExpenseByCostType } from '../../utils/cost-type';
import MonthNavigator from './MonthNavigator';
import TemplateActions from './TemplateActions';
import CategoryGroupList from './CategoryGroupList';
import DormantEntries from './DormantEntries';
import CostTypeSummary from './CostTypeSummary';
import TemplateEditor from './TemplateEditor';
import ConfirmDialog from '../shared/ConfirmDialog';

function EntriesView() {
  // THE MONTH ON SCREEN LIVES IN THE URL (`?month=YYYY-MM`).
  //
  // It was component state, so a reload -- or following a link back into the
  // app -- silently snapped back to the current month while the user was
  // halfway through entering January's figures. It is also the one thing worth
  // sending to the other member of a shared ledger ("look at our January").
  //
  // No parameter means the current month, which is why a plain `/entries` is
  // still the right address for "this month" and stays right tomorrow.
  const thisMonth = useMemo(() => toYearMonth(new Date()), []);
  const [currentYearMonth, setCurrentYearMonth] = useSearchParam({
    name: SEARCH_PARAMS.entries.month,
    parse: parseYearMonthParam,
    fallback: thisMonth,
    // Always written once the user moves: the address then says exactly which
    // month is on screen, so pasting it shows the recipient the same one.
    serialize: (ym: string) => ym,
  });
  const [showNewTemplate, setShowNewTemplate] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [copying, setCopying] = useState(false);

  const templates = useTemplateStore((s) => s.templates);
  const categories = useCategoryStore((s) => s.categories);
  const monthlyAmountsMap = useMonthlyStore((s) => s.monthlyAmountsMap);
  const fetchMonthlyAmounts = useMonthlyStore((s) => s.fetchMonthlyAmounts);
  const copyMonthlyAmounts = useMonthlyStore((s) => s.copyMonthlyAmounts);
  const deleteMonthlyAmount = useMonthlyStore((s) => s.deleteMonthlyAmount);
  const addToast = useToastStore((s) => s.addToast);

  // Loads the month on screen. Base data (templates, categories) comes from
  // App.tsx on mount.
  //
  // The shared hook rather than an effect of its own: it carries the active
  // ledger in its dependencies. Without that, switching ledgers empties the
  // month cache and nothing here re-fills it, so every row falls back to its
  // template default -- one household's overrides quietly replaced by defaults
  // under the other household's name, with no error and no spinner to notice.
  useMonthLoaded(currentYearMonth);

  // WHICH ENTRIES BELONG TO THE MONTH ON SCREEN.
  //
  // Since migration 005 an entry can skip months -- a yearly premium, a
  // bimonthly bill, a one-off trip. `enabled` no longer means "counts this
  // month", so every figure below is built from `occurring` rather than from
  // the whole list. Getting this wrong shows a household twelve car
  // inspections a year.
  //
  // The ones that do NOT occur are kept rather than discarded: they still need
  // to be editable from any month (otherwise a yearly bill is only reachable
  // in the one month it lands), and showing them in their own section is what
  // makes their ABSENCE from the totals visible instead of mysterious.
  const { occurring, dormant } = useMemo(() => {
    const occurring: typeof templates = [];
    const dormant: typeof templates = [];
    for (const template of templates) {
      (occursInMonth(template.recurrence, currentYearMonth) ? occurring : dormant).push(template);
    }
    return { occurring, dormant };
  }, [templates, currentYearMonth]);

  // Totals
  //
  // `templates` -- the FULL list -- is still what resolveAmount reads, because
  // it resolves an amount by id and needs every id to be findable. Only the set
  // being summed is narrowed.
  const totalIncome = useMemo(() => {
    return occurring
      .filter((t) => t.type === 'income' && t.enabled)
      .reduce((sum, t) => sum + resolveAmount(t.id, currentYearMonth, monthlyAmountsMap, templates), 0);
  }, [occurring, templates, currentYearMonth, monthlyAmountsMap]);

  const totalExpense = useMemo(() => {
    return occurring
      .filter((t) => t.type === 'expense' && t.enabled)
      .reduce((sum, t) => sum + resolveAmount(t.id, currentYearMonth, monthlyAmountsMap, templates), 0);
  }, [occurring, templates, currentYearMonth, monthlyAmountsMap]);

  // 固定費 / 変動費 for the month on screen. Built from the SAME amount
  // resolution as totalExpense above, so the parts always add up to the total
  // shown beside them.
  const costBreakdown = useMemo(
    () =>
      summarizeExpenseByCostType(occurring, categories, currentYearMonth, (t) =>
        resolveAmount(t.id, currentYearMonth, monthlyAmountsMap, templates),
      ),
    [occurring, templates, categories, currentYearMonth, monthlyAmountsMap],
  );

  // Copy from previous month
  const handleCopyFromLastMonth = useCallback(async () => {
    // shiftYearMonth, not local Date arithmetic: the month is now an address as
    // well as a value, and "the previous month" has to mean the same thing here
    // as it does to the ← button beside it.
    const prevMonth = shiftYearMonth(currentYearMonth, -1);
    setCopying(true);
    // WHICH entries are copied is decided by the server, from the rows under a
    // lock -- a list computed here would be stale the moment the other member of
    // a shared ledger changed a recurrence.
    //
    // Branching on the store's boolean rather than try/catch: the store swallows
    // the throw (reportError has already raised the toast), so a catch here
    // could never run and 「コピーしました」 would fire on failure.
    const copied = await copyMonthlyAmounts(prevMonth, currentYearMonth);
    setCopying(false);
    if (copied) addToast('先月の金額をコピーしました', 'success');
  }, [currentYearMonth, copyMonthlyAmounts, addToast]);

  // Reset to defaults
  const handleResetToDefaults = useCallback(async () => {
    setShowResetConfirm(false);
    const monthMap = monthlyAmountsMap.get(currentYearMonth);
    if (!monthMap || monthMap.size === 0) {
      addToast('リセットする月別金額はありません', 'info');
      return;
    }
    // Every result is collected, not just "did any throw".
    //
    // The store swallows its own failures (reportError has already raised the
    // toast), so a try/catch here could never run -- 「リセットしました」 would
    // fire even when half the deletes failed. And a partial failure is the
    // likely one: these run concurrently, and one refusal does not stop the
    // rest.
    const results = await Promise.all(
      Array.from(monthMap.keys()).map((templateId) =>
        deleteMonthlyAmount(templateId, currentYearMonth),
      ),
    );

    if (results.every(Boolean)) {
      addToast('デフォルト金額にリセットしました', 'success');
      return;
    }

    // Some rows are reset and some are not, and which is which is only knowable
    // from the server. Re-reading the month is what stops the screen from
    // disagreeing with storage; reportError has already said that something
    // failed, so this only has to say what state things are now in.
    // force: the month is still marked 'ready', so a plain fetch would be
    // deduplicated away -- and the screen would go on showing the values it
    // optimistically cleared while the database kept some of them.
    await fetchMonthlyAmounts(currentYearMonth, true);
    addToast('一部の金額をリセットできませんでした', 'error');
  }, [currentYearMonth, monthlyAmountsMap, deleteMonthlyAmount, fetchMonthlyAmounts, addToast]);

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

      {/* Expense split: what the 固定費/変動費 classification is for */}
      <CostTypeSummary breakdown={costBreakdown} />

      {/* Action bar */}
      <TemplateActions
        copying={copying}
        onAddTemplate={() => setShowNewTemplate(!showNewTemplate)}
        onCopyFromLastMonth={handleCopyFromLastMonth}
        onResetToDefaults={() => setShowResetConfirm(true)}
      />

      {/* New template form */}
      <AnimatePresence>
        {showNewTemplate && (
          <TemplateEditor
            onSave={() => setShowNewTemplate(false)}
            onCancel={() => setShowNewTemplate(false)}
          />
        )}
      </AnimatePresence>

      {/* Category groups -- this month's entries only */}
      <CategoryGroupList
        templates={occurring}
        categories={categories}
        yearMonth={currentYearMonth}
      />

      {/* Entries that exist but do not fall in this month. Collapsed, and
          explicitly outside the totals above. */}
      <DormantEntries templates={dormant} yearMonth={currentYearMonth} />

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
