import { lazy, Suspense, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { loadLedgerData } from './app/ledger';
import { navigate, navigateToView } from './app/navigation';
import { pathForView } from './app/routes';
import { reportError } from './app/reportError';
import { useRoute } from './hooks/useRoute';
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
// 英単語 carries the whole word list (80 entries with their notes and examples),
// which nothing else on any other screen reads. Eager-loading it would put a
// study aid into the bundle of somebody standing in a shop checking a balance.
const VocabView = lazy(() => import('./components/vocab/VocabView'));
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
  // WHICH SCREEN IS ON is read from the address bar, not held in state.
  //
  // It used to be `useState('dashboard')`, and a reload -- which a phone does on
  // its own the moment the browser reclaims the tab -- silently threw the screen
  // away along with the month or period being looked at. Deriving it from the
  // URL means reload, the back button and a pasted link cannot disagree with
  // what is rendered, because there is only one thing to read.
  const { view: currentView, canonical, matched } = useRoute();
  const [helpOpen, setHelpOpen] = useState(false);
  // The initial load of whichever ledger bootstrap selected. Subsequent
  // switches go through switchLedger, which clears before it reloads -- so this
  // deliberately does NOT depend on the active ledger. Two code paths racing to
  // refetch the same data on a switch would be worse than one.
  useEffect(() => {
    loadLedgerData().catch(reportError);
  }, []);

  // ONE SCREEN, ONE ADDRESS.
  //
  // `/`, a trailing slash and anything unrecognised all render the dashboard
  // (see matchView). Rewriting the address to the canonical one keeps `/` and
  // `/dashboard` from being two URLs for the same screen -- which would make a
  // shared link a coin toss between them and any later `?`-parameter handling
  // depend on which of the two the user happened to have.
  //
  // `replace`, so the address that was never really a screen does not become a
  // history entry the back button has to step over.
  //
  // THE QUERY SURVIVES when the path named a real screen (`/entries/` with a
  // trailing slash, say): stripping it here would throw the filter away on
  // exactly the reload this whole change exists to survive. It does NOT survive
  // an address that named no screen -- a stale link's `?month=` belongs to
  // nothing, and carrying it onto the dashboard would be a filter nobody chose.
  useEffect(() => {
    if (canonical) return;
    const query = matched ? window.location.search : '';
    navigate(`${pathForView(currentView)}${query}`, { replace: true });
  }, [canonical, matched, currentView]);

  useKeyboardShortcuts({
    onNavigate: navigateToView,
    onShowHelp: () => setHelpOpen(true),
  });

  return (
    <>
      <ParticleBackground />
      <Layout currentView={currentView} onNavigate={navigateToView}>
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
              <DashboardView onNavigate={navigateToView} />
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
          {currentView === 'vocab' && (
            <motion.div key="vocab" {...pageTransition}>
              <VocabView />
            </motion.div>
          )}
          {currentView === 'settings' && (
            <motion.div key="settings" {...pageTransition}>
              <SettingsView onNavigate={navigateToView} />
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
