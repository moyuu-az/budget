import { useState } from 'react';
import { motion } from 'framer-motion';
import type { Category, CategoryInput } from '../../types';
import { useCategoryStore } from '../../stores/useCategoryStore';
import { useTemplateStore } from '../../stores/useTemplateStore';
import { useToastStore } from '../../stores/useToastStore';
import ConfirmDialog from '../shared/ConfirmDialog';

interface EditState {
  id: number;
  name: string;
  color: string;
}

function CategoryManager() {
  const { categories, addCategory, updateCategory, deleteCategory } =
    useCategoryStore();
  const { templates } = useTemplateStore();
  const { addToast } = useToastStore();

  const [editing, setEditing] = useState<EditState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);

  // New category form state
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#8b5cf6');
  const [newType, setNewType] = useState<'income' | 'expense'>('expense');

  const incomeCategories = categories
    .filter((c) => c.type === 'income')
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const expenseCategories = categories
    .filter((c) => c.type === 'expense')
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const getLinkedTemplateCount = (categoryId: number) => {
    return templates.filter((t) => t.categoryId === categoryId).length;
  };

  const handleStartEdit = (category: Category) => {
    setEditing({
      id: category.id,
      name: category.name,
      color: category.color || '#8b5cf6',
    });
  };

  const handleSaveEdit = async () => {
    if (!editing || !editing.name.trim()) return;
    try {
      await updateCategory(editing.id, {
        name: editing.name.trim(),
        color: editing.color,
      });
      addToast('カテゴリを更新しました', 'success');
    } catch {
      addToast('更新に失敗しました', 'error');
    }
    setEditing(null);
  };

  const handleCancelEdit = () => {
    setEditing(null);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteCategory(deleteTarget.id);
      addToast('カテゴリを削除しました', 'success');
    } catch {
      addToast('削除に失敗しました', 'error');
    }
    setDeleteTarget(null);
  };

  const handleAdd = async () => {
    if (!newName.trim()) return;

    const sameTypeCategories = categories.filter((c) => c.type === newType);
    const maxSort = sameTypeCategories.reduce(
      (max, c) => Math.max(max, c.sortOrder),
      0,
    );

    const input: CategoryInput = {
      name: newName.trim(),
      type: newType,
      color: newColor,
      sortOrder: maxSort + 1,
    };

    try {
      await addCategory(input);
      setNewName('');
      setNewColor('#8b5cf6');
      addToast('カテゴリを追加しました', 'success');
    } catch {
      addToast('追加に失敗しました', 'error');
    }
  };

  const handleMoveUp = async (category: Category, list: Category[]) => {
    const idx = list.findIndex((c) => c.id === category.id);
    if (idx <= 0) return;
    const prev = list[idx - 1];
    await updateCategory(category.id, { sortOrder: prev.sortOrder });
    await updateCategory(prev.id, { sortOrder: category.sortOrder });
  };

  const handleMoveDown = async (category: Category, list: Category[]) => {
    const idx = list.findIndex((c) => c.id === category.id);
    if (idx < 0 || idx >= list.length - 1) return;
    const next = list[idx + 1];
    await updateCategory(category.id, { sortOrder: next.sortOrder });
    await updateCategory(next.id, { sortOrder: category.sortOrder });
  };

  const inputStyle = {
    background: 'rgba(100, 116, 170, 0.08)',
    border: '1px solid var(--border-subtle)',
  };

  const renderCategoryRow = (category: Category, list: Category[], idx: number) => {
    const isEditing = editing?.id === category.id;

    if (isEditing) {
      return (
        <motion.div
          key={category.id}
          layout
          className="flex items-center gap-3 py-2 px-3 rounded-lg"
          style={{ background: 'rgba(100, 116, 170, 0.06)' }}
        >
          <input
            type="color"
            value={editing.color}
            onChange={(e) => setEditing({ ...editing, color: e.target.value })}
            className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent"
          />
          <input
            type="text"
            value={editing.name}
            onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSaveEdit();
              if (e.key === 'Escape') handleCancelEdit();
            }}
            className="flex-1 rounded-lg px-3 py-1.5 text-sm text-white outline-none focus:border-purple-500/60 transition-colors"
            style={inputStyle}
            autoFocus
          />
          <button
            onClick={handleSaveEdit}
            className="text-xs px-3 py-1.5 rounded-lg text-white font-medium transition-colors"
            style={{
              background: 'rgba(34, 197, 94, 0.7)',
              border: '1px solid rgba(34, 197, 94, 0.3)',
            }}
          >
            保存
          </button>
          <button
            onClick={handleCancelEdit}
            className="text-xs px-3 py-1.5 rounded-lg text-slate-300 font-medium transition-colors hover:bg-slate-700"
          >
            取消
          </button>
        </motion.div>
      );
    }

    return (
      <motion.div
        key={category.id}
        layout
        className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-white/3 group"
      >
        {/* Color dot */}
        <div
          className="w-3 h-3 rounded-full shrink-0"
          style={{ backgroundColor: category.color || '#8b5cf6' }}
        />

        {/* Name */}
        <span className="flex-1 text-sm text-slate-200">{category.name}</span>

        {/* Sort buttons */}
        <button
          onClick={() => handleMoveUp(category, list)}
          disabled={idx === 0}
          className="text-slate-500 hover:text-slate-300 disabled:opacity-30 transition-colors p-1 opacity-0 group-hover:opacity-100"
          title="上へ"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
          </svg>
        </button>
        <button
          onClick={() => handleMoveDown(category, list)}
          disabled={idx === list.length - 1}
          className="text-slate-500 hover:text-slate-300 disabled:opacity-30 transition-colors p-1 opacity-0 group-hover:opacity-100"
          title="下へ"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Edit button */}
        <button
          onClick={() => handleStartEdit(category)}
          className="text-slate-500 hover:text-blue-400 transition-colors p-1 opacity-0 group-hover:opacity-100"
          title="編集"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </button>

        {/* Delete button */}
        <button
          onClick={() => setDeleteTarget(category)}
          className="text-slate-500 hover:text-red-400 transition-colors p-1 opacity-0 group-hover:opacity-100"
          title="削除"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </motion.div>
    );
  };

  const renderSection = (
    title: string,
    list: Category[],
  ) => (
    <div className="space-y-1">
      <h3 className="text-sm font-medium text-slate-400 mb-2">{title}</h3>
      {list.length === 0 ? (
        <p className="text-slate-600 text-xs px-3 py-2">カテゴリがありません</p>
      ) : (
        list.map((cat, idx) => renderCategoryRow(cat, list, idx))
      )}
    </div>
  );

  const linkedCount = deleteTarget ? getLinkedTemplateCount(deleteTarget.id) : 0;

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="glass rounded-2xl p-6 space-y-6"
      >
        <h2 className="text-lg font-semibold text-white">カテゴリ管理</h2>

        {/* Income categories */}
        {renderSection('収入カテゴリ', incomeCategories)}

        {/* Expense categories */}
        {renderSection('支出カテゴリ', expenseCategories)}

        {/* Add new category */}
        <div
          className="pt-4"
          style={{ borderTop: '1px solid var(--border-subtle)' }}
        >
          <h3 className="text-sm font-medium text-slate-400 mb-3">
            カテゴリを追加
          </h3>
          <div className="flex items-end gap-3 flex-wrap">
            <div>
              <label className="block text-xs text-slate-500 mb-1">色</label>
              <input
                type="color"
                value={newColor}
                onChange={(e) => setNewColor(e.target.value)}
                className="w-10 h-10 rounded cursor-pointer border-0 bg-transparent"
              />
            </div>
            <div className="flex-1 min-w-[140px]">
              <label className="block text-xs text-slate-500 mb-1">名前</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAdd();
                }}
                placeholder="カテゴリ名"
                className="w-full rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-purple-500/60 transition-colors"
                style={inputStyle}
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">種別</label>
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value as 'income' | 'expense')}
                className="rounded-lg px-3 py-2 text-sm text-white outline-none transition-colors appearance-none"
                style={inputStyle}
              >
                <option value="income">収入</option>
                <option value="expense">支出</option>
              </select>
            </div>
            <button
              onClick={handleAdd}
              disabled={!newName.trim()}
              className="px-4 py-2 text-white text-sm rounded-lg transition-colors font-medium disabled:opacity-50"
              style={{
                background: 'rgba(139, 92, 246, 0.7)',
                border: '1px solid rgba(139, 92, 246, 0.3)',
              }}
            >
              追加
            </button>
          </div>
        </div>
      </motion.div>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="カテゴリを削除"
        message={
          linkedCount > 0
            ? `このカテゴリには ${linkedCount} 件のテンプレートが紐づいています。削除するとそれらの紐づけが解除されます。削除しますか？`
            : 'このカテゴリを削除しますか？この操作は取り消せません。'
        }
        confirmLabel="削除"
        cancelLabel="キャンセル"
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  );
}

export default CategoryManager;
