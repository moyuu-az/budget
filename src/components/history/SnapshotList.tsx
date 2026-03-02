import { useState } from 'react';
import { motion } from 'framer-motion';
import type { BalanceSnapshot } from '../../types';
import { useSnapshotStore } from '../../stores/useSnapshotStore';
import { useToastStore } from '../../stores/useToastStore';
import ConfirmDialog from '../shared/ConfirmDialog';

interface Props {
  snapshots: BalanceSnapshot[];
}

function SnapshotList({ snapshots }: Props) {
  const { deleteSnapshot } = useSnapshotStore();
  const { addToast } = useToastStore();
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);

  const sorted = [...snapshots].sort((a, b) => b.date.localeCompare(a.date));

  const formatDate = (dateStr: string) => {
    return dateStr.replace(/-/g, '/');
  };

  const handleDelete = async () => {
    if (deleteTarget === null) return;
    try {
      await deleteSnapshot(deleteTarget);
      addToast('記録を削除しました', 'success');
    } catch {
      addToast('削除に失敗しました', 'error');
    }
    setDeleteTarget(null);
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.2 }}
        className="glass rounded-2xl p-6"
      >
        <h2 className="text-lg font-semibold text-white mb-4">更新履歴</h2>
        {sorted.length === 0 ? (
          <p className="text-slate-500 text-sm">記録がありません</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <th className="text-left text-xs text-slate-500 pb-2 font-medium">
                  日付
                </th>
                <th className="text-right text-xs text-slate-500 pb-2 font-medium">
                  残高
                </th>
                <th className="text-right text-xs text-slate-500 pb-2 font-medium w-16">
                  操作
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((s, index) => (
                <motion.tr
                  key={s.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: index * 0.03 }}
                  style={{
                    borderBottom: '1px solid rgba(100, 116, 170, 0.08)',
                  }}
                  className="hover:bg-white/3"
                >
                  <td className="py-2.5 text-sm text-slate-300">
                    {formatDate(s.date)}
                  </td>
                  <td className="py-2.5 text-sm text-white text-right font-medium tabular-nums">
                    ¥{s.balance.toLocaleString()}
                  </td>
                  <td className="py-2.5 text-right">
                    <button
                      onClick={() => setDeleteTarget(s.id)}
                      className="text-slate-500 hover:text-red-400 transition-colors p-1"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </button>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        )}
      </motion.div>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="記録を削除"
        message="この残高記録を削除しますか？この操作は取り消せません。"
        confirmLabel="削除"
        cancelLabel="キャンセル"
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  );
}

export default SnapshotList;
