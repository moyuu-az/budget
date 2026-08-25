import { lazy, Suspense, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { ViewType } from './types';
import { loadLedgerData } from './app/ledger';
import { reportError } from './app/reportError';
import Layout from './components/Layout';
import DashboardView from './components/dashboard/DashboardView';
import { Skeleton } from './components/ui/Skeleton';

// ---------------------------------------------------------------------------
// EVERY SCREEN EXCEPT THE FIRST ONE IS LOADED WHEN IT IS OPENED.
//
// This is a mobile change, not a tidiness one. The bundle was 395 kB gzipped in
// ONE file, and the device most likely to open this app is a phone on mobile
// data standing in a shop. Charting code for 分析 and 履歴 has no business being
// downloaded before the balance can be shown.
//
// The DASHBOARD stays eager: it is what loads on open, so deferring it would
// only add a round trip to the one screen everybody sees.
//
// Suspense fallback is a skeleton rather than a spinner, for the same reason
// LoadGate uses one -- it holds the height, so the page does not jump when the
// screen arrives.
// ---------------------------------------------------------------------------
const EntriesView = lazy(() => import('./components/entries/EntriesView'));
const HistoryView = lazy(() => import('./components/history/HistoryView'));
const AnalyticsView = lazy(() => import('./components/analytics/AnalyticsView'));
const AssetsView = lazy(() => import('./components/assets/AssetsView'));
const SettingsView = lazy(() => import('./components/settings/SettingsView'));
import ParticleBackground from './components/ParticleBackground';
import ShortcutHelpDialog from './components/layout/ShortcutHelpDialog';
import StaleClientOverlay from './components/layout/StaleClientOverlay';
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
        <Suspense
          fallback={
            <div role="status" aria-label="画面を読み込み中">
              <span className="sr-only">画面を読み込み中</span>
              <Skeleton height={320} className="w-full" />
            </div>
          }
        >
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
          {currentView === 'assets' && (
            <motion.div key="assets" {...pageTransition}>
              <AssetsView />
            </motion.div>
          )}
          {currentView === 'settings' && (
            <motion.div key="settings" {...pageTransition}>
              <SettingsView onNavigate={setCurrentView} />
            </motion.div>
          )}
        </AnimatePresence>
        </Suspense>
      </Layout>
      <ShortcutHelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
      {/* Renders nothing until the server refuses this bundle as out of date.
          Outside Layout so it covers the sidebar too -- the balance in it is one
          of the figures an old build can misread. */}
      <StaleClientOverlay />
      <Toast />
    </>
  );
}

export default App;
