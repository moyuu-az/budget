import { motion } from 'framer-motion';
import CategoryManager from './CategoryManager';

function SettingsView() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <h1 className="text-2xl font-bold text-white mb-6">設定</h1>
      <CategoryManager />
    </motion.div>
  );
}

export default SettingsView;
