import { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { ViewType } from '../types';
import CashBalance from './sidebar/CashBalance';
import LedgerSwitcher from './layout/LedgerSwitcher';
import Navigation from './sidebar/Navigation';
import MonthlySummary from './sidebar/MonthlySummary';
import ThemeToggle from './layout/ThemeToggle';
import { IconButton } from './ui/IconButton';
import { useUIStore } from '../stores/useUIStore';
import { VIEW_SHOWS_LEDGER_FIGURES } from '../app/routes';

// ---------------------------------------------------------------------------
// THE SHELL, ON A PHONE AS WELL AS A DESKTOP.
//
// WHY THIS MATTERS MORE THAN IT LOOKS
//   This is a household budget. The moment somebody actually needs it -- at a
//   till, in a shop, deciding whether to buy the thing -- they are holding a
//   phone. Until now the shell was a fixed 256px sidebar beside `flex-1` main,
//   inside `h-screen`, with no breakpoints at all: on a phone the content column
//   was about 100px wide and every figure wrapped.
//
// WHY THE SPLIT IS PURE CSS
//   No `useMediaQuery`, no width state. A JS breakpoint has to guess before it
//   has measured, which is a frame of the wrong layout on every load, and it is
//   one more piece of state that can disagree with what is on screen. Tailwind's
//   `md:` does the whole thing at paint time.
//
//   The cost is that BOTH shells are in the tree, and the mobile one holds the
//   same LedgerSwitcher and CashBalance as the desktop one. They are cheap
//   (both read stores, neither fetches) and duplicating the markup is what buys
//   the layout being decided by CSS rather than by JavaScript.
//
// WHY h-dvh AND NOT h-screen
//   `100vh` on mobile Safari is the viewport WITHOUT the URL bar, so a bottom
//   navigation bar positioned against it sits under the browser chrome -- the
//   one control the whole mobile layout is built around, permanently just
//   off-screen. `dvh` tracks the visible viewport instead.
// ---------------------------------------------------------------------------

interface Props {
  currentView: ViewType;
  onNavigate: (view: ViewType) => void;
  children: ReactNode;
}

const CollapseIcon = ({ collapsed }: { collapsed: boolean }) => (
  <svg
    className="w-5 h-5 transition-transform duration-200"
    style={{ transform: collapsed ? 'rotate(180deg)' : undefined }}
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={1.5}
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
  </svg>
);

function Layout({ currentView, onNavigate, children }: Props) {
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);

  return (
    <div className="flex h-dvh flex-col md:flex-row relative z-10">
      {/* --- Phone: a header carrying the two things that identify the screen.

          The ledger's name has to be here: this app has more than one household
          and showing the wrong one's figures under the right one's name is the
          failure the whole ledger design exists to prevent. The balance is here
          because it is the number people open the app for. */}
      <header className="md:hidden flex items-center gap-3 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-overlay)] px-4 py-2 backdrop-blur-sm">
        <div className="min-w-0 flex-1">
          <LedgerSwitcher />
        </div>
        <ThemeToggle />
      </header>

      {/* --- Desktop: the sidebar, unchanged. */}
      <motion.aside
        initial={false}
        animate={{ width: collapsed ? 64 : 256 }}
        transition={{ duration: 0.25, ease: 'easeInOut' }}
        className="hidden md:flex flex-col overflow-hidden border-r border-[var(--color-border-subtle)] bg-[var(--color-surface-overlay)] backdrop-blur-sm"
      >
        <div
          className={`flex items-center px-2 pt-3 pb-1 ${collapsed ? 'flex-col gap-1' : 'justify-between'}`}
        >
          <IconButton
            icon={<CollapseIcon collapsed={collapsed} />}
            label={collapsed ? 'サイドバーを開く' : 'サイドバーを閉じる'}
            size="sm"
            onClick={toggleSidebar}
          />
          <ThemeToggle />
        </div>

        {/* Ledger switcher + balance — hidden when collapsed (both need width) */}
        {!collapsed && (
          <div className="flex flex-col gap-3 px-4 py-3">
            <LedgerSwitcher />
            {/* The balance is edited on the 資産 screen, because that is where the
                cash holdings it sums actually live. */}
            <CashBalance onEdit={() => onNavigate('assets')} />
          </div>
        )}

        {/* Labelled even though only one of the two navigations is ever
            displayed: a landmark without a name is announced as just
            「ナビゲーション」, and the two are distinguishable in a snapshot or
            an audit only by their labels. */}
        <nav aria-label="メインナビゲーション" className="flex-1 px-2 py-2">
          <Navigation currentView={currentView} onNavigate={onNavigate} collapsed={collapsed} />
        </nav>

        {!collapsed && (
          <div className="px-4 py-3 border-t border-[var(--color-border-subtle)]">
            <MonthlySummary />
          </div>
        )}
      </motion.aside>

      {/* --- The content.

          `pb-20` on a phone clears the fixed tab bar. Without it the last row of
          every screen sits underneath it -- and the last row of 資産 is where
          the balance is edited. */}
      <main className="flex-1 overflow-y-auto p-4 pb-20 md:p-6 md:pb-6">
        {/* The balance and this month's summary live in the sidebar on a
            desktop, which does not exist here. They lead the page instead of
            being lost at the bottom of it.

            NOT ON EVERY SCREEN, THOUGH. These are the household's figures, and
            on a screen that shows none of the ledger's data they push the actual
            content below the fold of a phone for nothing. See
            VIEW_SHOWS_LEDGER_FIGURES -- a table rather than a comparison, so a
            new screen has to say which it is. */}
        {VIEW_SHOWS_LEDGER_FIGURES[currentView] && (
          <div className="md:hidden mb-4 space-y-4 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-overlay)] p-4">
            <CashBalance onEdit={() => onNavigate('assets')} />
            <div className="border-t border-[var(--color-border-subtle)] pt-3">
              <MonthlySummary />
            </div>
          </div>
        )}

        {children}
      </main>

      {/* --- Phone: the navigation, where a thumb can reach it.

          Fixed rather than sticky: the content scrolls inside `main`, so a
          sticky bar inside that scroller would scroll away with it. */}
      <nav
        aria-label="メインナビゲーション"
        className="md:hidden fixed inset-x-0 bottom-0 z-20 border-t border-[var(--color-border-subtle)] bg-[var(--color-surface-overlay)] backdrop-blur-sm"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <Navigation currentView={currentView} onNavigate={onNavigate} orientation="horizontal" />
      </nav>
    </div>
  );
}

export default Layout;
