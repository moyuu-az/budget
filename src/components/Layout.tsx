import { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { ViewType } from '../types';
import BalanceInput from './sidebar/BalanceInput';
import LedgerSwitcher from './layout/LedgerSwitcher';
import Navigation from './sidebar/Navigation';
import MonthlySummary from './sidebar/MonthlySummary';
import ThemeToggle from './layout/ThemeToggle';
import { IconButton } from './ui/IconButton';
import { useUIStore } from '../stores/useUIStore';

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
    <div className="flex h-screen relative z-10">
      {/* Sidebar */}
      <motion.aside
        initial={false}
        animate={{ width: collapsed ? 64 : 256 }}
        transition={{ duration: 0.25, ease: 'easeInOut' }}
        className="flex flex-col overflow-hidden border-r border-[var(--color-border-subtle)] bg-[var(--color-surface-overlay)] backdrop-blur-sm"
      >
        {/* Top controls: collapse toggle + theme toggle */}
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
            <BalanceInput />
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 px-2 py-2">
          <Navigation currentView={currentView} onNavigate={onNavigate} collapsed={collapsed} />
        </nav>

        {/* Monthly Summary — hidden when collapsed */}
        {!collapsed && (
          <div className="px-4 py-3 border-t border-[var(--color-border-subtle)]">
            <MonthlySummary />
          </div>
        )}
      </motion.aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-6">
        {children}
      </main>
    </div>
  );
}

export default Layout;
