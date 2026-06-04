import { motion } from 'framer-motion';
import { Card } from '../ui/Card';
import BalanceInput from '../sidebar/BalanceInput';
import CategoryManager from './CategoryManager';

function SettingsView() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <h1 className="text-2xl font-bold text-white mb-6">設定</h1>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <Card padding="lg">
          <h2 className="text-lg font-semibold text-white mb-4">残高</h2>
          <BalanceInput />
        </Card>
        <CategoryManager />
      </div>
    </motion.div>
  );
}

export default SettingsView;
