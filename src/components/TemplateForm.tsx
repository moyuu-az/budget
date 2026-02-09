import { useState, useEffect } from 'react';
import type { EntryTemplate, EntryTemplateInput } from '../types';

interface TemplateFormProps {
  editingTemplate?: EntryTemplate | null;
  onSave: (template: EntryTemplateInput) => Promise<void>;
  onCancel: () => void;
}

function TemplateForm({ editingTemplate, onSave, onCancel }: TemplateFormProps) {
  const [name, setName] = useState('');
  const [dayOfMonth, setDayOfMonth] = useState('1');
  const [type, setType] = useState<'income' | 'expense'>('expense');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editingTemplate) {
      setName(editingTemplate.name);
      setDayOfMonth(String(editingTemplate.dayOfMonth));
      setType(editingTemplate.type);
    } else {
      setName('');
      setDayOfMonth('1');
      setType('expense');
    }
  }, [editingTemplate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setSaving(true);
    await onSave({
      name: name.trim(),
      dayOfMonth: parseInt(dayOfMonth, 10),
      type
    });
    setSaving(false);

    if (!editingTemplate) {
      setName('');
      setDayOfMonth('1');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-xs text-slate-400 mb-1">Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Salary, Rent"
          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-slate-400 mb-1">Day of Month</label>
          <select
            value={dayOfMonth}
            onChange={(e) => setDayOfMonth(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
          >
            {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as 'income' | 'expense')}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
          >
            <option value="income">Income</option>
            <option value="expense">Expense</option>
          </select>
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={saving || !name.trim()}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm rounded-lg transition-colors"
        >
          {saving ? 'Saving...' : editingTemplate ? 'Update' : 'Add'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm rounded-lg transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export default TemplateForm;
