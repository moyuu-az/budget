import { useState } from 'react';
import CountUp from 'react-countup';
import { motion } from 'framer-motion';
import { formatWithCommas, parseCommaNumber, handleCurrencyInput } from '../utils/currency';

interface BalanceDisplayProps {
  balance: number;
  onUpdate: (balance: number) => Promise<void>;
}

function BalanceDisplay({ balance, onUpdate }: BalanceDisplayProps) {
  const [editing, setEditing] = useState(balance === 0);
  const [inputValue, setInputValue] = useState(balance === 0 ? '' : formatWithCommas(balance));
  const [prevBalance, setPrevBalance] = useState(balance);

  const handleStartEdit = () => {
    setInputValue(formatWithCommas(balance));
    setEditing(true);
  };

  const handleSave = async () => {
    const parsed = parseCommaNumber(inputValue);
    if (!isNaN(parsed)) {
      setPrevBalance(balance);
      await onUpdate(parsed);
    }
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') setEditing(false);
  };

  return (
    <motion.div
      className="relative overflow-hidden rounded-2xl p-6 glow-blue card-hover"
      style={{
        background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.15) 0%, rgba(139, 92, 246, 0.1) 100%)',
        border: '1px solid rgba(59, 130, 246, 0.2)',
      }}
      whileHover={{ scale: 1.02 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
    >
      <div
        className="absolute -top-10 -right-10 w-40 h-40 rounded-full opacity-20 blur-3xl"
        style={{ background: 'radial-gradient(circle, #3b82f6, transparent)' }}
      />
      <p className="text-blue-300/80 text-sm font-medium mb-1">現在の残高</p>
      {editing ? (
        <div className="flex items-center gap-2">
          <span className="text-white text-2xl">¥</span>
          <input
            type="text"
            inputMode="numeric"
            value={inputValue}
            onChange={(e) => setInputValue(handleCurrencyInput(e.target.value))}
            onKeyDown={handleKeyDown}
            onBlur={handleSave}
            autoFocus
            placeholder="残高を入力してください"
            className="bg-white/5 border border-blue-400/30 rounded-lg px-3 py-2 text-2xl font-bold text-white w-full outline-none focus:border-blue-400/60 transition-colors placeholder:text-blue-300/30 placeholder:text-base placeholder:font-normal"
          />
        </div>
      ) : (
        <button
          onClick={handleStartEdit}
          className="text-left w-full group"
        >
          <p className="text-3xl font-bold text-white tabular-nums">
            ¥<CountUp
              start={prevBalance}
              end={balance}
              duration={0.8}
              separator=","
              preserveValue
            />
          </p>
          <p className="text-blue-300/50 text-xs mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
            クリックして編集
          </p>
        </button>
      )}
    </motion.div>
  );
}

export default BalanceDisplay;
