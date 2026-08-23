import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { ViewType } from './types';
import { loadLedgerData } from './app/ledger';
import { reportError } from './app/reportError';
import Layout from './components/Layout';
import DashboardView from './components/dashboard/DashboardView';
import EntriesView from './components/entries/EntriesView';
import HistoryView from './components/history/HistoryView';
import AnalyticsView from './components/analytics/AnalyticsView';
import SettingsView from './components/settings/SettingsView';
import ParticleBackground from './components/ParticleBackground';
import ShortcutHelpDialog from './components/layout/ShortcutHelpDialog';
import { Toast } from './components/ui/Toast';
import { useThemeEffect } from './hooks/useTheme';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';

const pageTransition = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -20 },
  transition: { duration: 0.3, ease: 'easeOut' },
} as const;

function App() {
  useThemeEffect();
  const [currentView, setCurrentView] = useState<ViewType>('dashboard');
  const [helpOpen, setHelpOpen] = useState(false);
  // The initial load of whichever ledger bootstrap selected. Subsequent
  // switches go through switchLedger, which clears before it reloads -- so this
  // deliberately does NOT depend on the active ledger. Two code paths racing to
  // refetch the same data on a switch would be worse than one.
  useEffect(() => {
    loadLedgerData().catch(reportError);
  }, []);

  useKeyboardShortcuts({
    onNavigate: setCurrentView,
    onShowHelp: () => setHelpOpen(true),
  });

  return (
    <>
      <ParticleBackground />
      <Layout currentView={currentView} onNavigate={setCurrentView}>
        <AnimatePresence mode="wait">
          {currentView === 'dashboard' && (
            <motion.div key="dashboard" {...pageTransition}>
              <DashboardView onNavigate={setCurrentView} />
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
          {currentView === 'analytics' && (
            <motion.div key="analytics" {...pageTransition}>
              <AnalyticsView />
            </motion.div>
          )}
          {currentView === 'settings' && (
            <motion.div key="settings" {...pageTransition}>
              <SettingsView />
            </motion.div>
          )}
        </AnimatePresence>
      </Layout>
      <ShortcutHelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
      <Toast />
    </>
  );
}

export default App;
