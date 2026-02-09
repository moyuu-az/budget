import { useState } from 'react';
import type { BalanceSnapshot, BalanceSnapshotInput } from '../types';
import HistoryChart from './HistoryChart';

interface HistoryViewProps {
  snapshots: BalanceSnapshot[];
  currentBalance: number;
  onAdd: (snapshot: BalanceSnapshotInput) => Promise<BalanceSnapshot>;
  onDelete: (id: number) => Promise<void>;
}

function HistoryView({ snapshots, currentBalance, onAdd, onDelete }: HistoryViewProps) {
  const [date, setDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [balance, setBalance] = useState('');
  const [saving, setSaving] = useState(false);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseFloat(balance);
    if (!date || isNaN(parsed)) return;

    setSaving(true);
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

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={handleRecordCurrent}
          disabled={saving}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm rounded-lg transition-colors"
        >
          Record Current Balance (¥{currentBalance.toLocaleString()})
        </button>
      </div>

      <HistoryChart snapshots={snapshots} />

      <div className="bg-slate-900 rounded-2xl p-6 border border-slate-800">
        <h2 className="text-lg font-semibold text-white mb-4">Add Snapshot</h2>
        <form onSubmit={handleAdd} className="flex items-end gap-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-purple-500"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Balance (¥)</label>
            <input
              type="number"
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
              placeholder="0"
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-purple-500 w-40"
            />
          </div>
          <button
            type="submit"
            disabled={saving || !date || !balance}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm rounded-lg transition-colors"
          >
            Add
          </button>
        </form>
      </div>

      <div className="bg-slate-900 rounded-2xl p-6 border border-slate-800">
        <h2 className="text-lg font-semibold text-white mb-4">Snapshots</h2>
        {snapshots.length === 0 ? (
          <p className="text-slate-500 text-sm">No snapshots recorded yet</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="text-left text-xs text-slate-500 pb-2 font-medium">Date</th>
                <th className="text-right text-xs text-slate-500 pb-2 font-medium">Balance</th>
                <th className="text-right text-xs text-slate-500 pb-2 font-medium w-16"></th>
              </tr>
            </thead>
            <tbody>
              {snapshots.map((s) => (
                <tr key={s.id} className="border-b border-slate-800/50">
                  <td className="py-2 text-sm text-slate-300">{s.date}</td>
                  <td className="py-2 text-sm text-white text-right font-medium">
                    ¥{s.balance.toLocaleString()}
                  </td>
                  <td className="py-2 text-right">
                    <button
                      onClick={() => onDelete(s.id)}
                      className="text-slate-500 hover:text-red-400 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default HistoryView;
