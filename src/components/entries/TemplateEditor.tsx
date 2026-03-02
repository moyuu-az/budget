import { useState } from 'react';
import { motion } from 'framer-motion';
import { useTemplateStore } from '../../stores/useTemplateStore';
import { useCategoryStore } from '../../stores/useCategoryStore';
import { useToastStore } from '../../stores/useToastStore';
import { formatWithCommas, handleCurrencyInput, parseCommaNumber } from '../../utils/currency';
import ConfirmDialog from '../shared/ConfirmDialog';
import type { EntryTemplate } from '../../types';

interface Props {
  template?: EntryTemplate;
  onSave: () => void;
  onCancel: () => void;
}

function TemplateEditor({ template, onSave, onCancel }: Props) {
  const [name, setName] = useState(template?.name ?? '');
  const [dayOfMonth, setDayOfMonth] = useState(template?.dayOfMonth ?? 1);
  const [type, setType] = useState<'income' | 'expense'>(template?.type ?? 'expense');
  const [categoryId, setCategoryId] = useState<number | null>(template?.categoryId ?? null);
  const [defaultAmountStr, setDefaultAmountStr] = useState(
    template ? formatWithCommas(template.defaultAmount) : ''
  );
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [saving, setSaving] = useState(false);

  const categories = useCategoryStore((s) => s.categories);
  const addTemplate = useTemplateStore((s) => s.addTemplate);
  const updateTemplate = useTemplateStore((s) => s.updateTemplate);
  const deleteTemplate = useTemplateStore((s) => s.deleteTemplate);
  const addToast = useToastStore((s) => s.addToast);

  const filteredCategories = categories.filter((c) => c.type === type);

  const handleSave = async () => {
    if (!name.trim()) {
      addToast('名前を入力してください', 'error');
      return;
    }
    if (dayOfMonth < 1 || dayOfMonth > 31) {
      addToast('日付は1-31の間で入力してください', 'error');
      return;
    }

    setSaving(true);
    try {
      const defaultAmount = parseCommaNumber(defaultAmountStr);
      if (template) {
        await updateTemplate(template.id, {
          name: name.trim(),
          dayOfMonth,
          type,
          categoryId,
          defaultAmount,
        });
        addToast('テンプレートを更新しました', 'success');
      } else {
        await addTemplate({
          name: name.trim(),
          dayOfMonth,
          type,
          categoryId,
          defaultAmount,
        });
        addToast('テンプレートを追加しました', 'success');
      }
      onSave();
    } catch {
      addToast('保存に失敗しました', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!template) return;
    try {
      await deleteTemplate(template.id);
      addToast('テンプレートを削除しました', 'success');
      onSave();
    } catch {
      addToast('削除に失敗しました', 'error');
    }
  };

  return (
    <>
      <motion.div
        className="rounded-xl bg-slate-800/70 border border-slate-700/50 p-4 space-y-3"
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        exit={{ opacity: 0, height: 0 }}
        transition={{ duration: 0.2 }}
      >
        <div className="grid grid-cols-2 gap-3">
          {/* Name */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">名前</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg bg-slate-700/50 border border-slate-600/50 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none transition-colors"
              placeholder="家賃、給料など"
            />
          </div>

          {/* Day of month */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">日</label>
            <input
              type="number"
              min={1}
              max={31}
              value={dayOfMonth}
              onChange={(e) => setDayOfMonth(Math.max(1, Math.min(31, parseInt(e.target.value) || 1)))}
              className="w-full rounded-lg bg-slate-700/50 border border-slate-600/50 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none transition-colors"
            />
          </div>

          {/* Type */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">タイプ</label>
            <select
              value={type}
              onChange={(e) => {
                setType(e.target.value as 'income' | 'expense');
                setCategoryId(null);
              }}
              className="w-full rounded-lg bg-slate-700/50 border border-slate-600/50 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none transition-colors"
            >
              <option value="expense">支出</option>
              <option value="income">収入</option>
            </select>
          </div>

          {/* Category */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">カテゴリ</label>
            <select
              value={categoryId ?? ''}
              onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : null)}
              className="w-full rounded-lg bg-slate-700/50 border border-slate-600/50 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none transition-colors"
            >
              <option value="">未分類</option>
              {filteredCategories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Default amount */}
        <div>
          <label className="block text-xs text-slate-400 mb-1">デフォルト金額</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">¥</span>
            <input
              type="text"
              inputMode="numeric"
              value={defaultAmountStr}
              onChange={(e) => setDefaultAmountStr(handleCurrencyInput(e.target.value))}
              className="w-full rounded-lg bg-slate-700/50 border border-slate-600/50 pl-7 pr-3 py-2 text-sm text-white tabular-nums focus:border-blue-500 focus:outline-none transition-colors"
              placeholder="0"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-1">
          <div>
            {template && (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="px-3 py-1.5 text-xs text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded-lg transition-colors"
              >
                削除
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 rounded-lg transition-colors"
            >
              キャンセル
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      </motion.div>

      <ConfirmDialog
        open={showDeleteConfirm}
        title="テンプレートの削除"
        message={`「${template?.name}」を削除しますか？この操作は元に戻せません。`}
        confirmLabel="削除"
        cancelLabel="キャンセル"
        danger
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </>
  );
}

export default TemplateEditor;
