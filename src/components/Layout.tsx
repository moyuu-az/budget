import { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { ViewType } from '../types';
import BalanceInput from './sidebar/BalanceInput';
import Navigation from './sidebar/Navigation';
import MonthlySummary from './sidebar/MonthlySummary';
import UpdateNotification from './UpdateNotification';
import ThemeToggle from './layout/ThemeToggle';
import { IconButton } from './ui/IconButton';
import { useAutoUpdate } from '../hooks/useAutoUpdate';
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
  const {
    updateStatus,
    appVersion,
    downloadUpdate,
    installUpdate,
    dismissUpdate,
  } = useAutoUpdate();
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
        {/* Drag region for Electron window */}
        <div
          className="h-8 shrink-0"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        />

        {/* Top controls: collapse toggle + theme toggle */}
        <div
          className={`flex items-center px-2 pb-1 ${collapsed ? 'flex-col gap-1' : 'justify-between'}`}
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <IconButton
            icon={<CollapseIcon collapsed={collapsed} />}
            label={collapsed ? 'サイドバーを開く' : 'サイドバーを閉じる'}
            size="sm"
            onClick={toggleSidebar}
          />
          <ThemeToggle />
        </div>

        {/* Balance Input — hidden when collapsed (input needs width) */}
        {!collapsed && (
          <div className="px-4 py-3">
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

        {/* Update Notification — hidden when collapsed */}
        {!collapsed && appVersion && (
          <UpdateNotification
            appVersion={appVersion}
            updateStatus={updateStatus}
            onDownload={downloadUpdate}
            onInstall={installUpdate}
            onDismiss={dismissUpdate}
          />
        )}
      </motion.aside>

      {/* Main Content */}
      <main
        className="flex-1 overflow-y-auto p-6"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {children}
      </main>
    </div>
  );
}

export default Layout;
