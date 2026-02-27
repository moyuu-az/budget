import { ReactNode } from 'react';
import { ViewType } from '../types';
import BalanceInput from './sidebar/BalanceInput';
import Navigation from './sidebar/Navigation';
import MonthlySummary from './sidebar/MonthlySummary';
import UpdateNotification from './UpdateNotification';
import { useAutoUpdate } from '../hooks/useAutoUpdate';

interface Props {
  currentView: ViewType;
  onNavigate: (view: ViewType) => void;
  children: ReactNode;
}

function Layout({ currentView, onNavigate, children }: Props) {
  const {
    updateStatus,
    appVersion,
    downloadUpdate,
    installUpdate,
    dismissUpdate,
  } = useAutoUpdate();

  return (
    <div className="flex h-screen relative z-10">
      {/* Sidebar */}
      <aside className="w-64 flex flex-col border-r border-slate-700/50 bg-slate-900/80 backdrop-blur-sm">
        {/* Drag region for Electron window */}
        <div
          className="h-8 shrink-0"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        />

        {/* Balance Input */}
        <div className="px-4 py-3">
          <BalanceInput />
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-2 py-2">
          <Navigation currentView={currentView} onNavigate={onNavigate} />
        </nav>

        {/* Monthly Summary */}
        <div className="px-4 py-3 border-t border-slate-700/50">
          <MonthlySummary />
        </div>

        {/* Update Notification */}
        {appVersion && (
          <UpdateNotification
            appVersion={appVersion}
            updateStatus={updateStatus}
            onDownload={downloadUpdate}
            onInstall={installUpdate}
            onDismiss={dismissUpdate}
          />
        )}
      </aside>

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
