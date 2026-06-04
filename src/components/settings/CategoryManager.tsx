import { useState } from 'react';
import { motion } from 'framer-motion';
import type { Category, CategoryInput } from '../../types';
import { useCategoryStore } from '../../stores/useCategoryStore';
import { useTemplateStore } from '../../stores/useTemplateStore';
import { useToastStore } from '../../stores/useToastStore';
import ConfirmDialog from '../shared/ConfirmDialog';
import CategoryList from './CategoryList';
import CategoryForm from './CategoryForm';

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

        <CategoryList
          incomeCategories={incomeCategories}
          expenseCategories={expenseCategories}
          editing={editing}
          inputStyle={inputStyle}
          onEditingChange={setEditing}
          onStartEdit={handleStartEdit}
          onSaveEdit={handleSaveEdit}
          onCancelEdit={handleCancelEdit}
          onDelete={setDeleteTarget}
          onMoveUp={handleMoveUp}
          onMoveDown={handleMoveDown}
        />

        {/* Add new category */}
        <CategoryForm
          name={newName}
          color={newColor}
          type={newType}
          onNameChange={setNewName}
          onColorChange={setNewColor}
          onTypeChange={setNewType}
          onSubmit={handleAdd}
          inputStyle={inputStyle}
        />
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
