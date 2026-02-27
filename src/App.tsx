import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { ViewType } from './types';
import { useBalanceStore } from './stores/useBalanceStore';
import { useCategoryStore } from './stores/useCategoryStore';
import { useTemplateStore } from './stores/useTemplateStore';
import { useSnapshotStore } from './stores/useSnapshotStore';
import Layout from './components/Layout';
import DashboardView from './components/dashboard/DashboardView';
import EntriesView from './components/entries/EntriesView';
import HistoryView from './components/history/HistoryView';
import SettingsView from './components/settings/SettingsView';
import ParticleBackground from './components/ParticleBackground';
import Toast from './components/shared/Toast';

const pageTransition = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -20 },
  transition: { duration: 0.3, ease: 'easeOut' },
};

function App() {
  const [currentView, setCurrentView] = useState<ViewType>('dashboard');
  const fetchBalance = useBalanceStore((s) => s.fetchBalance);
  const fetchCategories = useCategoryStore((s) => s.fetchCategories);
  const fetchTemplates = useTemplateStore((s) => s.fetchTemplates);
  const fetchSnapshots = useSnapshotStore((s) => s.fetchSnapshots);

  useEffect(() => {
    fetchBalance();
    fetchCategories();
    fetchTemplates();
    fetchSnapshots();
  }, [fetchBalance, fetchCategories, fetchTemplates, fetchSnapshots]);

  return (
    <>
      <ParticleBackground />
      <Layout currentView={currentView} onNavigate={setCurrentView}>
        <AnimatePresence mode="wait">
          {currentView === 'dashboard' && (
            <motion.div key="dashboard" {...pageTransition}>
              <DashboardView />
            </motion.div>
          )}
          {currentView === 'entries' && (
            <motion.div key="entries" {...pageTransition}>
              <EntriesView />
            </motion.div>
          )}
          {currentView === 'history' && (
            <motion.div key="history" {...pageTransition}>
              <HistoryView />
            </motion.div>
          )}
          {currentView === 'settings' && (
            <motion.div key="settings" {...pageTransition}>
              <SettingsView />
            </motion.div>
          )}
        </AnimatePresence>
      </Layout>
      <Toast />
    </>
  );
}

export default App;
