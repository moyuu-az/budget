import { useState } from 'react';
import { motion } from 'framer-motion';
import { useSnapshotStore } from '../../stores/useSnapshotStore';
import { useCashBalance } from '../../hooks/useCashBalance';
import { useToastStore } from '../../stores/useToastStore';
import { parseCommaNumber, handleCurrencyInput, formatYen } from '../../utils/currency';

const inputStyle = {
  background: 'rgba(100, 116, 170, 0.08)',
  border: '1px solid var(--border-subtle)',
};

interface Props {
  onSuccess?: () => void;
}

function SnapshotForm({ onSuccess }: Props) {
  const { addSnapshot } = useSnapshotStore();
  const currentBalance = useCashBalance();
  const { addToast } = useToastStore();

  const [date, setDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [balanceInput, setBalanceInput] = useState('');
  const [saving, setSaving] = useState(false);

  // Both handlers branch on the store's boolean rather than wrapping the call in
  // try/catch: the store swallows the throw (reportError has already raised the
  // toast), so a catch here would never run and the success message would fire
  // on failure -- beside the error message, with the form closing as if the
  // record had been saved.
  const handleRecordCurrent = async () => {
    const today = new Date().toISOString().split('T')[0];
    setSaving(true);
    if (await addSnapshot(today, currentBalance)) {
      addToast('現在の残高を記録しました', 'success');
      onSuccess?.();
    }
    setSaving(false);
  };

  /**
   * Records a balance for a chosen date -- history, not the current figure.
   *
   * It deliberately does NOT change 現在の残高. That number is the sum of the
   * cash holdings on the 資産 screen, and there is no answer here to "which
   * holding changed?" -- this form's date is usually in the past, where the
   * question does not even apply. Writing a past figure into today's cash was
   * what the old version did, and it silently rewrote the forecast's starting
   * point every time someone filled in a missing month.
   */
  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseCommaNumber(balanceInput);
    if (!date || isNaN(parsed)) return;

    setSaving(true);
    if (await addSnapshot(date, parsed)) {
      setBalanceInput('');
      addToast('残高を記録しました', 'success');
      onSuccess?.();
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
          現在の残高を記録 ({formatYen(currentBalance)})
        </button>
      </motion.div>

      {/* Manual entry form */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="glass rounded-2xl p-6"
      >
        <h2 className="text-lg font-semibold text-white mb-2">過去の残高を記録</h2>
        <p className="text-xs text-slate-400 mb-4">
          記録するだけで、現在の残高は変わりません。現在の残高は資産の「現金」から計算されます。
        </p>
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
            記録
          </button>
        </form>
      </motion.div>
    </>
  );
}

export default SnapshotForm;
