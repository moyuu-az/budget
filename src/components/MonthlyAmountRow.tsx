import { useState, useRef, useEffect } from 'react';
import type { EntryTemplate } from '../types';
import { formatWithCommas, parseCommaNumber, handleCurrencyInput } from '../utils/currency';

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
    setInputValue(amount != null && amount > 0 ? formatWithCommas(amount) : '');
    setEditing(true);
  };

  const handleSave = () => {
    setEditing(false);
    const parsed = parseCommaNumber(inputValue);
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
    <div
      className={`flex items-center justify-between rounded-lg px-4 py-3 transition-all ${
        template.enabled ? '' : 'opacity-50'
      }`}
      style={{
        background: 'rgba(100, 116, 170, 0.06)',
        border: '1px solid transparent',
      }}
    >
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
          <p className="text-xs text-slate-500">
            {template.dayOfMonth >= 29 ? `毎月${template.dayOfMonth}日 (月末)` : `毎月${template.dayOfMonth}日`}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className={`text-sm ${template.type === 'income' ? 'text-green-400' : 'text-red-400'}`}>
          ¥
        </span>
        {editing ? (
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            value={inputValue}
            onChange={(e) => setInputValue(handleCurrencyInput(e.target.value))}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            className="w-28 rounded px-2 py-1 text-sm text-white text-right outline-none transition-colors"
            style={{
              background: 'rgba(100, 116, 170, 0.08)',
              border: '1px solid rgba(59, 130, 246, 0.4)',
            }}
          />
        ) : (
          <button
            onClick={handleStartEdit}
            className={`w-28 text-right px-2 py-1 rounded text-sm transition-colors ${
              hasAmount
                ? 'text-white hover:bg-white/5'
                : 'text-slate-600 hover:bg-white/5 hover:text-slate-400'
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
