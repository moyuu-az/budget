import { useState } from 'react';
import { formatCurrency } from '../utils/forecast';

interface BalanceDisplayProps {
  balance: number;
  onUpdate: (balance: number) => Promise<void>;
}

function BalanceDisplay({ balance, onUpdate }: BalanceDisplayProps) {
  const [editing, setEditing] = useState(false);
  const [inputValue, setInputValue] = useState('');

  const handleStartEdit = () => {
    setInputValue(String(balance));
    setEditing(true);
  };

  const handleSave = async () => {
    const parsed = parseFloat(inputValue);
    if (!isNaN(parsed)) {
      await onUpdate(parsed);
    }
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') setEditing(false);
  };

  return (
    <div className="bg-gradient-to-br from-blue-600 to-blue-800 rounded-2xl p-6 shadow-lg">
      <p className="text-blue-200 text-sm font-medium mb-1">Current Balance</p>
      {editing ? (
        <div className="flex items-center gap-2">
          <span className="text-white text-2xl">¥</span>
          <input
            type="number"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleSave}
            autoFocus
            className="bg-blue-900/50 border border-blue-400/50 rounded-lg px-3 py-2 text-2xl font-bold text-white w-full outline-none focus:border-blue-300"
          />
        </div>
      ) : (
        <button
          onClick={handleStartEdit}
          className="text-left w-full group"
        >
          <p className="text-3xl font-bold text-white">
            ¥{balance.toLocaleString()}
          </p>
          <p className="text-blue-300 text-xs mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
            Click to edit
          </p>
        </button>
      )}
    </div>
  );
}

export default BalanceDisplay;
