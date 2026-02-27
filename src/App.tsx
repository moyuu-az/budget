import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ParticleBackground from './components/ParticleBackground';
import Layout from './components/Layout';
import DashboardView from './components/dashboard/DashboardView';
import EntriesView from './components/entries/EntriesView';
import HistoryView from './components/HistoryView';
import { useDatabase } from './hooks/useDatabase';
import type { ViewType } from './types';

function App() {
  const [currentView, setCurrentView] = useState<ViewType>('dashboard');
  const {
    balance,
    templates,
    monthlyAmountsMap,
    snapshots,
    loading,
    setBalance,
    addTemplate,
    updateTemplate,
    deleteTemplate,
    toggleTemplate,
    setMonthlyAmount,
    copyMonthlyAmounts,
    getMonthlyAmountsForMonth,
    addSnapshot,
    deleteSnapshot
  } = useDatabase();

  if (loading) {
    return (
      <>
        <ParticleBackground />
        <div className="relative z-10">
          <Layout
            currentView={currentView}
            onNavigate={setCurrentView}
          >
            <div className="flex items-center justify-center h-full">
              <motion.div
                className="flex flex-col items-center gap-4"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
              >
                <motion.div
                  className="w-8 h-8 border-2 border-slate-600 border-t-blue-500 rounded-full"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
                />
                <p className="text-slate-400 text-sm">読み込み中...</p>
              </motion.div>
            </div>
          </Layout>
        </div>
      </>
    );
  }

  return (
    <>
      <ParticleBackground />
      <div className="relative z-10">
        <Layout
          currentView={currentView}
          onNavigate={setCurrentView}
        >
          <AnimatePresence mode="wait">
            {currentView === 'dashboard' && (
              <motion.div
                key="dashboard"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
              >
                <DashboardView />
              </motion.div>
            )}
            {currentView === 'entries' && (
              <motion.div
                key="entries"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
              >
                <EntriesView />
              </motion.div>
            )}
            {currentView === 'history' && (
              <motion.div
                key="history"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
              >
                <HistoryView
                  snapshots={snapshots}
                  currentBalance={balance}
                  onAdd={addSnapshot}
                  onDelete={deleteSnapshot}
                  onSetBalance={setBalance}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </Layout>
      </div>
    </>
  );
}

export default App;
