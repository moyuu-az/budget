import { useState, useRef, useEffect } from 'react';
import { useBalanceStore } from '../../stores/useBalanceStore';
import { formatWithCommas, parseCommaNumber } from '../../utils/currency';

function BalanceInput() {
  const { balance, setBalance } = useBalanceStore();
  const [displayValue, setDisplayValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const savedValueRef = useRef(balance);

  // Sync display value with store balance when not focused
  useEffect(() => {
    if (!isFocused) {
      setDisplayValue(formatWithCommas(balance));
      savedValueRef.current = balance;
    }
  }, [balance, isFocused]);

  const handleFocus = () => {
    setIsFocused(true);
    savedValueRef.current = balance;
    // Show raw number on focus
    setDisplayValue(String(balance));
    // Select all text after state update
    requestAnimationFrame(() => {
      inputRef.current?.select();
    });
  };

  const handleBlur = () => {
    setIsFocused(false);
    const parsed = parseCommaNumber(displayValue);
    if (parsed !== savedValueRef.current) {
      setBalance(parsed);
    }
    setDisplayValue(formatWithCommas(parsed));
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Allow only digits, commas, minus sign
    const raw = e.target.value.replace(/[^\d-]/g, '');
    setDisplayValue(raw);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const parsed = parseCommaNumber(displayValue);
      setBalance(parsed);
      inputRef.current?.blur();
    } else if (e.key === 'Escape') {
      setDisplayValue(formatWithCommas(savedValueRef.current));
      setIsFocused(false);
      inputRef.current?.blur();
    }
  };

  return (
    <div>
      <label className="block text-xs text-slate-400 mb-1.5">
        現在の残高
      </label>
      <div className="flex items-center gap-1">
        <span className="text-xl text-slate-400 font-light">¥</span>
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          value={displayValue}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className="w-full text-2xl font-bold text-white bg-slate-800/50 border border-slate-600 rounded-lg px-3 py-2 outline-none focus:border-blue-400/60 focus:ring-1 focus:ring-blue-400/30 transition-colors"
        />
      </div>
    </div>
  );
}

export default BalanceInput;
