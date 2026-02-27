import { useState } from 'react';
import { motion } from 'framer-motion';
import type { EntryTemplate, EntryTemplateInput } from '../types';
import TemplateForm from './TemplateForm';

interface TemplateManagerProps {
  templates: EntryTemplate[];
  onAdd: (template: EntryTemplateInput) => Promise<EntryTemplate>;
  onUpdate: (id: number, template: Partial<EntryTemplateInput>) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onClose: () => void;
}

function TemplateManager({ templates, onAdd, onUpdate, onDelete, onClose }: TemplateManagerProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<EntryTemplate | null>(null);

  const handleSave = async (input: EntryTemplateInput) => {
    if (editingTemplate) {
      await onUpdate(editingTemplate.id, input);
      setEditingTemplate(null);
    } else {
      await onAdd(input);
    }
    setShowForm(false);
  };

  const handleEdit = (template: EntryTemplate) => {
    setEditingTemplate(template);
    setShowForm(true);
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingTemplate(null);
  };

  const handleDelete = async (id: number) => {
    await onDelete(id);
    if (editingTemplate?.id === id) {
      setShowForm(false);
      setEditingTemplate(null);
    }
  };

  const incomeTemplates = templates.filter((t) => t.type === 'income');
  const expenseTemplates = templates.filter((t) => t.type === 'expense');

  return (
    <motion.div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      style={{ backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <motion.div
        className="glass-strong rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col"
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
      >
        <div className="flex items-center justify-between p-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <h2 className="text-lg font-semibold text-white">テンプレート管理</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/5"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {!showForm && (
            <button
              onClick={() => { setEditingTemplate(null); setShowForm(true); }}
              className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors font-medium"
            >
              + テンプレート追加
            </button>
          )}

          {showForm && (
            <div className="rounded-xl p-4" style={{ background: 'rgba(100, 116, 170, 0.08)', border: '1px solid var(--border-subtle)' }}>
              <TemplateForm
                editingTemplate={editingTemplate}
                onSave={handleSave}
                onCancel={handleCancel}
              />
            </div>
          )}

          {incomeTemplates.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-green-400 uppercase tracking-wider mb-2">収入</h3>
              <ul className="space-y-1">
                {incomeTemplates.map((t) => (
                  <TemplateRow key={t.id} template={t} onEdit={handleEdit} onDelete={handleDelete} />
                ))}
              </ul>
            </div>
          )}

          {expenseTemplates.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-2">支出</h3>
              <ul className="space-y-1">
                {expenseTemplates.map((t) => (
                  <TemplateRow key={t.id} template={t} onEdit={handleEdit} onDelete={handleDelete} />
                ))}
              </ul>
            </div>
          )}

          {templates.length === 0 && !showForm && (
            <p className="text-slate-500 text-sm text-center py-4">テンプレートがありません</p>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

function TemplateRow({
  template,
  onEdit,
  onDelete
}: {
  template: EntryTemplate;
  onEdit: (t: EntryTemplate) => void;
  onDelete: (id: number) => void;
}) {
  return (
    <motion.li
      className="flex items-center justify-between rounded-lg px-4 py-2.5 transition-colors hover:bg-white/5"
      style={{ background: 'rgba(100, 116, 170, 0.06)', border: '1px solid transparent' }}
      whileHover={{ borderColor: 'rgba(100, 116, 170, 0.15)' }}
    >
      <div>
        <p className="text-sm text-white font-medium">{template.name}</p>
        <p className="text-xs text-slate-500">
          {template.dayOfMonth >= 29 ? `毎月${template.dayOfMonth}日 (月末)` : `毎月${template.dayOfMonth}日`}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onEdit(template)}
          className="text-slate-500 hover:text-blue-400 transition-colors p-1"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </button>
        <button
          onClick={() => { if (window.confirm('このテンプレートを削除しますか？')) onDelete(template.id); }}
          className="text-slate-500 hover:text-red-400 transition-colors p-1"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </motion.li>
  );
}

export default TemplateManager;
