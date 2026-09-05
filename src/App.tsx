import { lazy, Suspense, useEffect, useState, type ReactElement } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { ViewType } from './types';
import { loadLedgerData } from './app/ledger';
import { navigate, navigateToView } from './app/navigation';
import { pathForView } from './app/routes';
import { reportError } from './app/reportError';
import { useRoute } from './hooks/useRoute';
import Layout from './components/Layout';
import DashboardView from './components/dashboard/DashboardView';
import { ScreenBoundary } from './components/layout/ScreenBoundary';
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

// ---------------------------------------------------------------------------
// THE SCREEN THAT IS RENDERED IS A LOOKUP, NOT A LADDER OF COMPARISONS.
//
// This used to be seven `currentView === 'x' && <motion.div key="x">…` lines.
// Two things were wrong with that:
//
//   - A NEW SCREEN could be added to ViewType, to VIEW_SEGMENT and to the
//     navigation, and still render nothing here, because a missing line is not
//     a type error. The address bar would say `/whatever`, the tab would be
//     highlighted, and the page would be blank.
//   - It described the same fact -- the set of screens -- for the third time,
//     after `ViewType` and `VIEW_SEGMENT`. `satisfies Record<ViewType, …>`
//     turns the third copy into a compile-time check of the other two.
//
// The value is a function rather than an element so that nothing but the screen
// being shown is ever constructed. (Constructing an element would not fetch a
// chunk either -- `lazy()` fetches on first RENDER -- so this is about not
// building six elements per render, not about the network.)
// ---------------------------------------------------------------------------
const SCREENS = {
  dashboard: () => <DashboardView onNavigate={navigateToView} />,
  entries: () => <EntriesView />,
  history: () => <HistoryView />,
  analytics: () => <AnalyticsView />,
  assets: () => <AssetsView />,
  vocab: () => <VocabView />,
  settings: () => <SettingsView onNavigate={navigateToView} />,
} as const satisfies Record<ViewType, () => ReactElement>;

const pageTransition = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -20 },
  transition: { duration: 0.3, ease: 'easeOut' },
} as const;

/**
 * Held while a screen's chunk is in flight.
 *
 * A skeleton rather than a spinner, for the same reason LoadGate uses one: it
 * holds the height, so the page does not jump when the screen arrives.
 */
function ScreenFallback(): ReactElement {
  return (
    <div role="status" aria-label="画面を読み込み中">
      <span className="sr-only">画面を読み込み中</span>
      <Skeleton height={320} className="w-full" />
    </div>
  );
}

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

  const renderScreen = SCREENS[currentView];

  return (
    <>
      <ParticleBackground />
      <Layout currentView={currentView} onNavigate={navigateToView}>
        {/* --- THE SUSPENSE BOUNDARY IS INSIDE THE ANIMATED WRAPPER, AND THERE
            IS ONE PER SCREEN. THIS IS LOAD-BEARING.

            It used to be a single boundary around AnimatePresence, and that
            combination could leave the app rendering one screen while the
            address bar named another -- permanently, not for a frame:

              1. 英単語 is opened. Its chunk has not arrived, so it suspends.
              2. A boundary ABOVE AnimatePresence hides everything inside it and
                 shows the fallback.
              3. The user presses 分析, or the back button. AnimatePresence is
                 told to swap, and `mode="wait"` will not bring the new screen in
                 until the outgoing one has finished ANIMATING OUT.
              4. The outgoing one is the suspended 英単語. It is not mounted, it
                 cannot animate, and its exit therefore never completes.
              5. When the chunk finally lands, 英単語 is what appears -- at
                 `/analytics`, under a highlighted 分析 tab.

            Reproduced as `src/App.transition.test.tsx`. Moving the boundary
            inside means the thing AnimatePresence is animating is always a real
            mounted `<div>` holding a skeleton, so an exit always completes and
            the swap always finishes.

            The key is the screen, so the boundary (and the ScreenBoundary below
            it) belong to that screen and are cleared by leaving it.

            ONE WINDOW REMAINS, AND IT IS HARMLESS ONLY BECAUSE OF A RULE:
            a chunk that lands DURING the 300ms exit of its abandoned screen is
            rendered inside the wrapper that is fading out -- the wrapper is
            still mounted, so React resolves the Suspense in place -- and its
            mount effects run, at an address that now names a different screen.
            It fades away with the wrapper and the swap still completes (also in
            App.transition.test.tsx). What makes that safe is that NO SCREEN
            WRITES TO THE ADDRESS ON MOUNT: every setSearchParams call in this
            app is behind a user action. A screen that "normalised" a missing
            `?day=` in an effect would, in this window, write 英単語's filter
            onto `/analytics`. Keep it that way. --- */}
        <AnimatePresence mode="wait">
          <motion.div key={currentView} {...pageTransition}>
            <ScreenBoundary>
              <Suspense fallback={<ScreenFallback />}>{renderScreen()}</Suspense>
            </ScreenBoundary>
          </motion.div>
        </AnimatePresence>
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
