import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useSnapshotStore } from '../../stores/useSnapshotStore';
import SnapshotForm from './SnapshotForm';
import HistoryChart from './HistoryChart';
import SnapshotList from './SnapshotList';

function HistoryView() {
  const { snapshots, fetchSnapshots } = useSnapshotStore();

  useEffect(() => {
    fetchSnapshots();
  }, [fetchSnapshots]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <h1 className="text-2xl font-bold text-white">残高履歴</h1>

      {/* Quick record & manual entry */}
      <SnapshotForm />

      {/* Chart (only if 2+ snapshots) */}
      {snapshots.length >= 2 && <HistoryChart snapshots={snapshots} />}

      {/* Snapshot list */}
      <SnapshotList snapshots={snapshots} />
    </motion.div>
  );
}

export default HistoryView;
