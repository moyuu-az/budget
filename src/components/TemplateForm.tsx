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

  const selectedDay = parseInt(dayOfMonth, 10);

  const inputClass = 'w-full rounded-lg px-3 py-2 text-sm text-white outline-none transition-colors focus:border-blue-500/60';
  const inputStyle = {
    background: 'rgba(100, 116, 170, 0.08)',
    border: '1px solid var(--border-subtle)',
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-xs text-slate-400 mb-1">名前</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例: 給料, 家賃"
          className={inputClass}
          style={inputStyle}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-slate-400 mb-1">支払日</label>
          <select
            value={dayOfMonth}
            onChange={(e) => setDayOfMonth(e.target.value)}
            className={inputClass}
            style={inputStyle}
          >
            {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>{d}日</option>
            ))}
            <option value="29">29日</option>
            <option value="30">30日</option>
            <option value="31">月末 (末日)</option>
          </select>
          {selectedDay >= 29 && (
            <p className="text-xs text-amber-400/80 mt-1">
              ※ 日数が少ない月は自動的に月末日になります
            </p>
          )}
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">種類</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as 'income' | 'expense')}
            className={inputClass}
            style={inputStyle}
          >
            <option value="income">収入</option>
            <option value="expense">支出</option>
          </select>
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={saving || !name.trim()}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm rounded-lg transition-colors font-medium"
        >
          {saving ? '保存中...' : editingTemplate ? '更新' : '追加'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-slate-400 hover:text-white text-sm rounded-lg transition-colors"
          style={{ background: 'rgba(100, 116, 170, 0.1)', border: '1px solid var(--border-subtle)' }}
        >
          キャンセル
        </button>
      </div>
    </form>
  );
}

export default TemplateForm;
