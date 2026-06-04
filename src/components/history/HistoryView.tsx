import { useState } from 'react';
import { motion } from 'framer-motion';
import { useSnapshotStore } from '../../stores/useSnapshotStore';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { EmptyState } from '../ui/EmptyState';
import SnapshotForm from './SnapshotForm';
import HistoryChart from './HistoryChart';
import SnapshotList from './SnapshotList';

function HistoryView() {
  const { snapshots } = useSnapshotStore();
  const [formOpen, setFormOpen] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">残高履歴</h1>
        <Button onClick={() => setFormOpen(true)}>残高を記録</Button>
      </div>

      {snapshots.length === 0 ? (
        <EmptyState
          title="まだ記録がありません"
          description="残高を記録すると、ここに推移グラフと履歴が表示されます。"
          action={<Button onClick={() => setFormOpen(true)}>残高を記録</Button>}
        />
      ) : (
        <>
          {snapshots.length >= 2 && <HistoryChart snapshots={snapshots} />}
          <SnapshotList snapshots={snapshots} />
        </>
      )}

      <Dialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="残高を記録"
        size="md"
      >
        <SnapshotForm onSuccess={() => setFormOpen(false)} />
      </Dialog>
    </motion.div>
  );
}

export default HistoryView;
