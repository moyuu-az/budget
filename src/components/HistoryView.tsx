import { useState } from 'react';
import { motion } from 'framer-motion';
import type { BalanceSnapshot, BalanceSnapshotInput } from '../types';
import HistoryChart from './HistoryChart';
import { parseCommaNumber, handleCurrencyInput } from '../utils/currency';

interface HistoryViewProps {
  snapshots: BalanceSnapshot[];
  currentBalance: number;
  onAdd: (snapshot: BalanceSnapshotInput) => Promise<BalanceSnapshot>;
  onDelete: (id: number) => Promise<void>;
  onSetBalance: (balance: number) => Promise<void>;
}

function HistoryView({ snapshots, currentBalance, onAdd, onDelete, onSetBalance }: HistoryViewProps) {
  const [date, setDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [balance, setBalance] = useState('');
  const [saving, setSaving] = useState(false);

  const handleUpdateBalance = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseCommaNumber(balance);
    if (!date || isNaN(parsed)) return;

    setSaving(true);
    await onSetBalance(parsed);
    await onAdd({ date, balance: parsed });
    setBalance('');
    setSaving(false);
  };

  const handleRecordCurrent = async () => {
    const today = new Date().toISOString().split('T')[0];
    setSaving(true);
    await onAdd({ date: today, balance: currentBalance });
    setSaving(false);
  };

  const inputStyle = {
    background: 'rgba(100, 116, 170, 0.08)',
    border: '1px solid var(--border-subtle)',
  };

  return (
    <div className="space-y-6">
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
            background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.8) 0%, rgba(99, 102, 241, 0.8) 100%)',
            border: '1px solid rgba(139, 92, 246, 0.3)',
          }}
        >
          現在の残高を記録 (¥{currentBalance.toLocaleString()})
        </button>
      </motion.div>

      <HistoryChart snapshots={snapshots} />

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="glass rounded-2xl p-6"
      >
        <h2 className="text-lg font-semibold text-white mb-4">残高を更新</h2>
        <form onSubmit={handleUpdateBalance} className="flex items-end gap-3">
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
            <label className="block text-xs text-slate-400 mb-1">残高 (¥)</label>
            <input
              type="text"
              inputMode="numeric"
              value={balance}
              onChange={(e) => setBalance(handleCurrencyInput(e.target.value))}
              placeholder="0"
              className="rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-purple-500/60 w-40 transition-colors"
              style={inputStyle}
            />
          </div>
          <button
            type="submit"
            disabled={saving || !date || !balance}
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

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.2 }}
        className="glass rounded-2xl p-6"
      >
        <h2 className="text-lg font-semibold text-white mb-4">更新履歴</h2>
        {snapshots.length === 0 ? (
          <p className="text-slate-500 text-sm">記録がありません</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <th className="text-left text-xs text-slate-500 pb-2 font-medium">日付</th>
                <th className="text-right text-xs text-slate-500 pb-2 font-medium">残高</th>
                <th className="text-right text-xs text-slate-500 pb-2 font-medium w-16"></th>
              </tr>
            </thead>
            <tbody>
              {snapshots.map((s, index) => (
                <motion.tr
                  key={s.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: index * 0.03 }}
                  style={{ borderBottom: '1px solid rgba(100, 116, 170, 0.08)' }}
                  className="hover:bg-white/3"
                >
                  <td className="py-2.5 text-sm text-slate-300">{s.date}</td>
                  <td className="py-2.5 text-sm text-white text-right font-medium tabular-nums">
                    ¥{s.balance.toLocaleString()}
                  </td>
                  <td className="py-2.5 text-right">
                    <button
                      onClick={() => { if (window.confirm('この記録を削除しますか？')) onDelete(s.id); }}
                      className="text-slate-500 hover:text-red-400 transition-colors p-1"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        )}
      </motion.div>
    </div>
  );
}

export default HistoryView;
