import { useState, useRef, useEffect } from 'react';
import type { EntryTemplate } from '../types';

interface MonthlyAmountRowProps {
  template: EntryTemplate;
  amount: number | undefined;
  onAmountChange: (templateId: number, amount: number) => void;
  onToggle: (id: number, enabled: boolean) => void;
}

function MonthlyAmountRow({ template, amount, onAmountChange, onToggle }: MonthlyAmountRowProps) {
  const [editing, setEditing] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const handleStartEdit = () => {
    setInputValue(amount != null && amount > 0 ? String(amount) : '');
    setEditing(true);
  };

  const handleSave = () => {
    setEditing(false);
    const parsed = parseFloat(inputValue);
    if (!isNaN(parsed) && parsed >= 0) {
      onAmountChange(template.id, parsed);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setEditing(false);
    }
  };

  const hasAmount = amount != null && amount > 0;

  return (
    <div className={`flex items-center justify-between bg-slate-800 rounded-lg px-4 py-3 transition-opacity ${
      template.enabled ? '' : 'opacity-50'
    }`}>
      <div className="flex items-center gap-3">
        <button
          onClick={() => onToggle(template.id, !template.enabled)}
          className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
            template.enabled
              ? 'bg-blue-600 border-blue-600'
              : 'border-slate-600 hover:border-slate-500'
          }`}
        >
          {template.enabled && (
            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </button>
        <div>
          <p className="text-sm text-white font-medium">{template.name}</p>
          <p className="text-xs text-slate-500">Day {template.dayOfMonth}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className={`text-sm ${template.type === 'income' ? 'text-green-400' : 'text-red-400'}`}>
          ¥
        </span>
        {editing ? (
          <input
            ref={inputRef}
            type="number"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            min="0"
            className="w-28 bg-slate-900 border border-blue-500 rounded px-2 py-1 text-sm text-white text-right outline-none"
          />
        ) : (
          <button
            onClick={handleStartEdit}
            className={`w-28 text-right px-2 py-1 rounded text-sm transition-colors ${
              hasAmount
                ? 'text-white hover:bg-slate-700'
                : 'text-slate-600 hover:bg-slate-700 hover:text-slate-400'
            }`}
          >
            {hasAmount ? amount.toLocaleString() : '0'}
          </button>
        )}
      </div>
    </div>
  );
}

export default MonthlyAmountRow;
