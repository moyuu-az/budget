import { useState } from 'react';
import { motion } from 'framer-motion';
import { useSnapshotStore } from '../../stores/useSnapshotStore';
import { useBalanceStore } from '../../stores/useBalanceStore';
import { useToastStore } from '../../stores/useToastStore';
import { parseCommaNumber, handleCurrencyInput } from '../../utils/currency';

const inputStyle = {
  background: 'rgba(100, 116, 170, 0.08)',
  border: '1px solid var(--border-subtle)',
};

function SnapshotForm() {
  const { addSnapshot } = useSnapshotStore();
  const { balance: currentBalance, setBalance } = useBalanceStore();
  const { addToast } = useToastStore();

  const [date, setDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [balanceInput, setBalanceInput] = useState('');
  const [saving, setSaving] = useState(false);

  const handleRecordCurrent = async () => {
    const today = new Date().toISOString().split('T')[0];
    setSaving(true);
    try {
      await addSnapshot(today, currentBalance);
      addToast('現在の残高を記録しました', 'success');
    } catch {
      addToast('記録に失敗しました', 'error');
    }
    setSaving(false);
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseCommaNumber(balanceInput);
    if (!date || isNaN(parsed)) return;

    setSaving(true);
    try {
      await setBalance(parsed);
      await addSnapshot(date, parsed);
      setBalanceInput('');
      addToast('残高を更新しました', 'success');
    } catch {
      addToast('更新に失敗しました', 'error');
    }
    setSaving(false);
  };

  return (
    <>
      {/* Quick record button */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex items-center gap-3"
      >
        <button
          onClick={handleRecordCurrent}
          disabled={saving}
          className="relative overflow-hidden px-4 py-2.5 text-white text-sm rounded-lg transition-colors font-medium disabled:opacity-50"
          style={{
            background:
              'linear-gradient(135deg, rgba(139, 92, 246, 0.8) 0%, rgba(99, 102, 241, 0.8) 100%)',
            border: '1px solid rgba(139, 92, 246, 0.3)',
          }}
        >
          現在の残高を記録 (¥{currentBalance.toLocaleString()})
        </button>
      </motion.div>

      {/* Manual entry form */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="glass rounded-2xl p-6"
      >
        <h2 className="text-lg font-semibold text-white mb-4">残高を更新</h2>
        <form onSubmit={handleManualSubmit} className="flex items-end gap-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">日付</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-purple-500/60 transition-colors"
              style={inputStyle}
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              残高 (¥)
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={balanceInput}
              onChange={(e) => setBalanceInput(handleCurrencyInput(e.target.value))}
              placeholder="0"
              className="rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-purple-500/60 w-40 transition-colors"
              style={inputStyle}
            />
          </div>
          <button
            type="submit"
            disabled={saving || !date || !balanceInput}
            className="px-4 py-2 text-white text-sm rounded-lg transition-colors font-medium disabled:opacity-50"
            style={{
              background: 'rgba(139, 92, 246, 0.7)',
              border: '1px solid rgba(139, 92, 246, 0.3)',
            }}
          >
            更新
          </button>
        </form>
      </motion.div>
    </>
  );
}

export default SnapshotForm;
