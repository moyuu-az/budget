import type { CSSProperties } from 'react';
import { motion } from 'framer-motion';
import type { Category } from '../../types';
import ColorPicker from './ColorPicker';

interface EditState {
  id: number;
  name: string;
  color: string;
}

interface Props {
  incomeCategories: Category[];
  expenseCategories: Category[];
  editing: EditState | null;
  inputStyle: CSSProperties;
  onEditingChange: (editing: EditState) => void;
  onStartEdit: (category: Category) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDelete: (category: Category) => void;
  onMoveUp: (category: Category, list: Category[]) => void;
  onMoveDown: (category: Category, list: Category[]) => void;
}

function CategoryList({
  incomeCategories,
  expenseCategories,
  editing,
  inputStyle,
  onEditingChange,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  onMoveUp,
  onMoveDown,
}: Props) {
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
          <ColorPicker
            value={editing.color}
            onChange={(value) => onEditingChange({ ...editing, color: value })}
            className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent"
          />
          <input
            type="text"
            value={editing.name}
            onChange={(e) => onEditingChange({ ...editing, name: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSaveEdit();
              if (e.key === 'Escape') onCancelEdit();
            }}
            className="flex-1 rounded-lg px-3 py-1.5 text-sm text-white outline-none focus:border-purple-500/60 transition-colors"
            style={inputStyle}
            autoFocus
          />
          <button
            onClick={onSaveEdit}
            className="text-xs px-3 py-1.5 rounded-lg text-white font-medium transition-colors"
            style={{
              background: 'rgba(34, 197, 94, 0.7)',
              border: '1px solid rgba(34, 197, 94, 0.3)',
            }}
          >
            保存
          </button>
          <button
            onClick={onCancelEdit}
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
          onClick={() => onMoveUp(category, list)}
          disabled={idx === 0}
          className="text-slate-500 hover:text-slate-300 disabled:opacity-30 transition-colors p-1 opacity-0 group-hover:opacity-100"
          title="上へ"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
          </svg>
        </button>
        <button
          onClick={() => onMoveDown(category, list)}
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
          onClick={() => onStartEdit(category)}
          className="text-slate-500 hover:text-blue-400 transition-colors p-1 opacity-0 group-hover:opacity-100"
          title="編集"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </button>

        {/* Delete button */}
        <button
          onClick={() => onDelete(category)}
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

  return (
    <>
      {/* Income categories */}
      {renderSection('収入カテゴリ', incomeCategories)}

      {/* Expense categories */}
      {renderSection('支出カテゴリ', expenseCategories)}
    </>
  );
}

export default CategoryList;
